#!/bin/bash

# IP Camera Event Video Compiler
# Usage: ./compile_event.sh <camera_ip> <start_datetime> <end_datetime> [output_file]
# Datetime format: YYYY-MM-DDTHH:MM:SS (e.g., 2024-03-15T14:30:00)

set -e

# --- CONFIGURATION ---

# Networking
REMOTE_PATH="/mnt/mmcblk0p1/littercam/records" # Base path for recordings
SSH_USER="root"                                # SSH username for the camera

# Grace period in seconds to look for files before the official event start time.
# This accounts for event detection latency or clock drift.
BUFFER_SECONDS=60

# Camera Hardware Settings
CLIP_DURATION_SECONDS=120 # Match your camera's clip length (10, 30, 60, etc.)

# Video Processing Options (set to true to enable)
CROP_LEFT_HALF=true     # Crop to left half of video
ROTATE_90_CCW=true      # Rotate 90 degrees counter-clockwise

# --- SCRIPT LOGIC ---

LOCAL_TEMP_DIR="./temp_event_$(date +%s)"

# Function to detect timezone from the remote camera
detect_camera_timezone() {
    local camera_ip="$1"
    echo "Detecting timezone from camera $camera_ip..." >&2
    
    # Get TZ from /etc/TZ file (as set in /etc/profile)
    local detected_tz
    detected_tz=$(ssh "${SSH_USER}@${camera_ip}" "cat /etc/TZ 2>/dev/null || echo ''" | tr -d '\r\n')
    
    if [[ -n "$detected_tz" && "$detected_tz" != "" ]]; then
        echo "  Found timezone from /etc/TZ: $detected_tz" >&2
        echo "$detected_tz"
        return 0
    else
        echo "  Error: Could not read timezone from /etc/TZ" >&2
        return 1
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 <camera_ip> <start_datetime> <end_datetime> [output_file]"
    echo "  camera_ip: IP address of the camera"
    echo "  start_datetime: Event start time in camera timezone (YYYY-MM-DDTHH:MM:SS)"
    echo "  end_datetime: Event end time in camera timezone (YYYY-MM-DDTHH:MM:SS)"
    echo "  output_file: Optional output filename (default: event_YYYYMMDD_HHMMSS.mp4)"
    echo ""
    echo "Example: $0 192.168.1.100 2024-03-15T14:30:00 2024-03-15T14:32:30"
    exit 1
}

# Function to convert datetime to epoch using the specified camera timezone.
datetime_to_epoch() {
    TZ="$CAMERA_TZ" date -d "$1" +%s 2>/dev/null || {
        echo "Error: Invalid datetime format '$1'. Use YYYY-MM-DDTHH:MM:SS"
        exit 1
    }
}

# Function to extract datetime from filename and convert to epoch.
filename_to_epoch() {
    local filename="$1"
    local datetime_part="${filename%%.mp4}"
    local formatted_datetime="${datetime_part:0:4}-${datetime_part:4:2}-${datetime_part:6:2}T${datetime_part:9:2}:${datetime_part:11:2}:${datetime_part:13:2}"
    TZ="$CAMERA_TZ" date -d "$formatted_datetime" +%s 2>/dev/null || echo 0
}

# Function to get remote file list from a date-structured directory.
get_remote_file_list() {
    local start_dt="$1"
    local end_dt="$2"

    # --- BUG FIX STARTS HERE ---
    # First, get the epoch for the start time.
    local start_epoch
    start_epoch=$(datetime_to_epoch "$start_dt")
    # Then, perform simple arithmetic to get the buffered start time.
    # This is more portable than asking `date` to parse a complex string.
    local search_start_epoch=$((start_epoch - BUFFER_SECONDS))
    # --- BUG FIX ENDS HERE ---

    # Get epoch for the start of the hour for both search start and event end times
    local start_hour_epoch
    start_hour_epoch=$(TZ="$CAMERA_TZ" date -d "@$search_start_epoch" '+%Y-%m-%d %H:00:00' | TZ="$CAMERA_TZ" date -f- +%s)
    local end_hour_epoch
    end_hour_epoch=$(TZ="$CAMERA_TZ" date -d "$end_dt" '+%Y-%m-%d %H:00:00' | TZ="$CAMERA_TZ" date -f- +%s)

    # Build a list of hourly directories to scan
    local DIRS_TO_SCAN=()
    local current_epoch=$start_hour_epoch
    while [[ $current_epoch -le $end_hour_epoch ]]; do
        local dir_path
        dir_path=$(TZ="$CAMERA_TZ" date -d "@$current_epoch" +%Y%m%d/%H)
        DIRS_TO_SCAN+=("${REMOTE_PATH}/${dir_path}")
        current_epoch=$((current_epoch + 3600)) # Move to the next hour
    done

    echo "Scanning remote directories (buffer included): ${DIRS_TO_SCAN[*]}"
    ssh "${SSH_USER}@${CAMERA_IP}" "ls -1 ${DIRS_TO_SCAN[@]}/*.mp4 2>/dev/null || true"
}

# Function to cleanup temporary files
cleanup() {
    if [[ -d "$LOCAL_TEMP_DIR" ]]; then
        echo "Cleaning up temporary files..."
        rm -rf "$LOCAL_TEMP_DIR"
    fi
}

trap cleanup EXIT

if [[ $# -lt 3 ]]; then
    usage
fi

CAMERA_IP="$1"
START_DATETIME="$2"
END_DATETIME="$3"

# Detect timezone from the camera
CAMERA_TZ=$(detect_camera_timezone "$CAMERA_IP")
if [[ $? -ne 0 || -z "$CAMERA_TZ" ]]; then
    echo "Error: Failed to detect timezone from camera. Cannot proceed."
    exit 1
else
    echo "Using detected timezone: $CAMERA_TZ"
fi

OUTPUT_FILE="${4:-event_$(TZ="$CAMERA_TZ" date -d "$START_DATETIME" +%Y%m%d_%H%M%S).mp4}"

# Convert datetimes to epochs for precise calculations
START_EPOCH=$(datetime_to_epoch "$START_DATETIME")
END_EPOCH=$(datetime_to_epoch "$END_DATETIME")
EXTENDED_START_EPOCH=$((START_EPOCH - BUFFER_SECONDS))

if [[ $START_EPOCH -ge $END_EPOCH ]]; then
    echo "Error: Start datetime must be before end datetime"
    exit 1
fi

echo "Event time range: $START_DATETIME to $END_DATETIME (Timezone: $CAMERA_TZ)"
echo "Buffer: ${BUFFER_SECONDS}s. Searching for files from $(TZ="$CAMERA_TZ" date -d "@$EXTENDED_START_EPOCH")"

mkdir -p "$LOCAL_TEMP_DIR"

echo "Fetching file list from camera..."
FILE_LIST=$(get_remote_file_list "$START_DATETIME" "$END_DATETIME")

if [[ -z "$FILE_LIST" ]]; then
    echo "No MP4 files found on camera in the specified time range."
    exit 1
fi

# Filter files that overlap with our buffered event time range
RELEVANT_FILES=()
echo "Analyzing files for time overlap..."

while IFS= read -r file_path; do
    if [[ -z "$file_path" ]]; then continue; fi
    
    filename=$(basename "$file_path")
    file_start_epoch=$(filename_to_epoch "$filename")
    
    if [[ $file_start_epoch -eq 0 ]]; then
        echo "Warning: Could not parse datetime from $filename, skipping"
        continue
    fi
    
    file_end_epoch=$((file_start_epoch + CLIP_DURATION_SECONDS))
    
    # Check if file overlaps with buffered event time range:
    # [file_start, file_end] must overlap with [extended_start, event_end]
    if [[ $file_start_epoch -lt $END_EPOCH && $file_end_epoch -gt $EXTENDED_START_EPOCH ]]; then
        RELEVANT_FILES+=("$file_path")
        if [[ $file_start_epoch -lt $START_EPOCH ]]; then
            echo "  Found relevant file (in buffer): $filename"
        else
            echo "  Found relevant file: $filename"
        fi
    fi
done <<< "$FILE_LIST"

if [[ ${#RELEVANT_FILES[@]} -eq 0 ]]; then
    echo "No files found that overlap with the specified time range (including buffer)"
    exit 1
fi

IFS=$'\n' RELEVANT_FILES=($(sort <<<"${RELEVANT_FILES[*]}"))
unset IFS

echo "Found ${#RELEVANT_FILES[@]} relevant files to download."

# Download relevant files
echo "Downloading files from camera..."
for file in "${RELEVANT_FILES[@]}"; do
    filename=$(basename "$file")
    echo "  Downloading $filename..."
    # Using SSH+cat as the primary method as it's often more reliable than scp on embedded devices
    if ! ssh "${SSH_USER}@${CAMERA_IP}" "cat '${file}'" > "$LOCAL_TEMP_DIR/$filename" || [[ ! -s "$LOCAL_TEMP_DIR/$filename" ]]; then
        echo "    Error: Failed to download $filename"
        exit 1
    fi
done

# Create file list for ffmpeg
FILELIST="$LOCAL_TEMP_DIR/filelist.txt"
> "$FILELIST"
for file in "${RELEVANT_FILES[@]}"; do
    filename=$(basename "$file")
    echo "file '$filename'" >> "$FILELIST"
done

echo "Concatenating videos..."
cd "$LOCAL_TEMP_DIR"
TEMP_CONCAT="temp_concat.mp4"
ffmpeg -f concat -safe 0 -i "filelist.txt" -c copy "$TEMP_CONCAT" -y -loglevel warning -fflags +genpts

# Calculate trim times based on PRECISE event start, not buffered start
FIRST_FILE_START=$(filename_to_epoch "$(basename "${RELEVANT_FILES[0]}")")
START_TRIM=$((START_EPOCH - FIRST_FILE_START))
if [[ $START_TRIM -lt 0 ]]; then START_TRIM=0; fi

TOTAL_DURATION=$((END_EPOCH - START_EPOCH))

echo "Trimming video to exact event duration..."
# Resolve output path before we change back directories
ABS_OUTPUT_FILE=$(realpath -m "$OUTPUT_FILE")

# Build ffmpeg filter chain
FILTER_CHAIN=""
if [[ "$CROP_LEFT_HALF" == "true" ]]; then FILTER_CHAIN="crop=iw/2:ih:0:0"; fi
if [[ "$ROTATE_90_CCW" == "true" ]]; then
    [[ -n "$FILTER_CHAIN" ]] && FILTER_CHAIN="${FILTER_CHAIN},"
    FILTER_CHAIN="${FILTER_CHAIN}transpose=2"
fi

# Apply filters if any are set
if [[ -n "$FILTER_CHAIN" ]]; then
    echo "Applying video filters: $FILTER_CHAIN"
    ffmpeg -i "$TEMP_CONCAT" -ss "$START_TRIM" -t "$TOTAL_DURATION" -vf "$FILTER_CHAIN" -c:v libx264 -c:a aac "$ABS_OUTPUT_FILE" -y -loglevel warning
else
    ffmpeg -i "$TEMP_CONCAT" -ss "$START_TRIM" -t "$TOTAL_DURATION" -c:v libx264 -c:a aac "$ABS_OUTPUT_FILE" -y -loglevel warning
fi

cd - > /dev/null

if [[ -f "$ABS_OUTPUT_FILE" ]]; then
    OUTPUT_SIZE=$(du -h "$ABS_OUTPUT_FILE" | cut -f1)
    echo ""
    echo "✅ Event video created successfully!"
    echo "   File: $ABS_OUTPUT_FILE"
    echo "   Size: $OUTPUT_SIZE"
    echo "   Covers: $START_DATETIME to $END_DATETIME"
else
    echo "❌ Error: Output file was not created"
    exit 1
fi