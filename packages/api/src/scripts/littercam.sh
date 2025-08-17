#!/bin/bash

# IP Camera Event Video Compiler
# Usage: ./compile_event.sh <camera_ip> <start_datetime> <end_datetime> [output_file]
# Datetime format: YYYY-MM-DDTHH:MM:SS (e.g., 2024-03-15T14:30:00)

set -e

# Configuration
REMOTE_PATH="/mnt/mmcblk0p1/littercam/records"
LOCAL_TEMP_DIR="./temp_event_$(date +%s)"
SSH_USER="root"  # Change this to your SSH username

# Camera settings
CLIP_DURATION_SECONDS=30  # Change this to match your camera's clip length (10, 30, 60, etc.)

# Video processing options (set to true to enable)
CROP_LEFT_HALF=true     # Crop to left half of video
ROTATE_90_CCW=true      # Rotate 90 degrees counter-clockwise

# Function to display usage
usage() {
    echo "Usage: $0 <camera_ip> <start_datetime> <end_datetime> [output_file]"
    echo "  camera_ip: IP address of the camera"
    echo "  start_datetime: Event start time (YYYY-MM-DDTHH:MM:SS)"
    echo "  end_datetime: Event end time (YYYY-MM-DDTHH:MM:SS)"
    echo "  output_file: Optional output filename (default: event_YYYYMMDD_HHMMSS.mp4)"
    echo ""
    echo "Example: $0 192.168.1.100 2024-03-15T14:30:00 2024-03-15T14:32:30"
    exit 1
}

# Function to convert datetime to epoch
datetime_to_epoch() {
    date -d "$1" +%s 2>/dev/null || {
        echo "Error: Invalid datetime format '$1'. Use YYYY-MM-DDTHH:MM:SS"
        exit 1
    }
}

# Function to convert datetime to filename format
datetime_to_filename() {
    date -d "$1" +%Y%m%dT%H%M%S 2>/dev/null
}

# Function to extract datetime from filename
filename_to_epoch() {
    local filename="$1"
    local datetime_part="${filename%%.mp4}"
    local formatted_datetime="${datetime_part:0:4}-${datetime_part:4:2}-${datetime_part:6:2}T${datetime_part:9:2}:${datetime_part:11:2}:${datetime_part:13:2}"
    date -d "$formatted_datetime" +%s 2>/dev/null || echo 0
}

# Function to cleanup temporary files
cleanup() {
    if [[ -d "$LOCAL_TEMP_DIR" ]]; then
        echo "Cleaning up temporary files..."
        rm -rf "$LOCAL_TEMP_DIR"
    fi
}

# Set cleanup trap
trap cleanup EXIT

# Parse arguments
if [[ $# -lt 3 ]]; then
    usage
fi

CAMERA_IP="$1"
START_DATETIME="$2"
END_DATETIME="$3"
OUTPUT_FILE="${4:-event_$(date -d "$START_DATETIME" +%Y%m%d_%H%M%S).mp4}"

# Validate datetime formats and convert to epochs
START_EPOCH=$(datetime_to_epoch "$START_DATETIME")
END_EPOCH=$(datetime_to_epoch "$END_DATETIME")

if [[ $START_EPOCH -ge $END_EPOCH ]]; then
    echo "Error: Start datetime must be before end datetime"
    exit 1
fi

echo "Event time range: $START_DATETIME to $END_DATETIME"
echo "Looking for files on camera $CAMERA_IP..."

# Create temporary directory
mkdir -p "$LOCAL_TEMP_DIR"

# Get list of files from camera
echo "Fetching file list from camera..."
FILE_LIST=$(ssh "${SSH_USER}@${CAMERA_IP}" "ls -1 ${REMOTE_PATH}/*.mp4 2>/dev/null || true")

if [[ -z "$FILE_LIST" ]]; then
    echo "No MP4 files found on camera"
    exit 1
fi

# Filter files that overlap with our event time range
RELEVANT_FILES=()
echo "Analyzing files for time overlap..."

# Add a smaller buffer to catch files that might start slightly after event start
# This accounts for recording startup delay but doesn't go too far back
BUFFER_SECONDS=15  # Reduced from 60 to avoid picking up too many old files

while IFS= read -r file; do
    if [[ -z "$file" ]]; then continue; fi
    
    filename=$(basename "$file")
    file_start_epoch=$(filename_to_epoch "$filename")
    
    if [[ $file_start_epoch -eq 0 ]]; then
        echo "Warning: Could not parse datetime from $filename, skipping"
        continue
    fi
    
    # Each file is CLIP_DURATION_SECONDS long
    file_end_epoch=$((file_start_epoch + CLIP_DURATION_SECONDS))
    
    # Check if file overlaps with event time range
    # Only include files that actually contain some part of the event
    if [[ $file_start_epoch -lt $END_EPOCH && $file_end_epoch -gt $START_EPOCH ]]; then
        RELEVANT_FILES+=("$file")
        
        # Show if this file starts before event
        if [[ $file_start_epoch -lt $START_EPOCH ]]; then
            echo "  Found relevant file: $filename (starts before event)"
        elif [[ $file_start_epoch -gt $START_EPOCH ]]; then
            delay=$((file_start_epoch - START_EPOCH))
            echo "  Found relevant file: $filename (starts ${delay}s after event)"
        else
            echo "  Found relevant file: $filename (starts with event)"
        fi
    fi
done <<< "$FILE_LIST"

# If no files found with strict overlap, look for files that start shortly after event start
if [[ ${#RELEVANT_FILES[@]} -eq 0 ]]; then
    echo "No files found with strict overlap, looking for files within buffer time..."
    while IFS= read -r file; do
        if [[ -z "$file" ]]; then continue; fi
        
        filename=$(basename "$file")
        file_start_epoch=$(filename_to_epoch "$filename")
        
        if [[ $file_start_epoch -eq 0 ]]; then continue; fi
        
        file_end_epoch=$((file_start_epoch + CLIP_DURATION_SECONDS))
        extended_start=$((START_EPOCH - BUFFER_SECONDS))
        
        if [[ $file_start_epoch -lt $END_EPOCH && $file_end_epoch -gt $extended_start ]]; then
            RELEVANT_FILES+=("$file")
            delay=$((file_start_epoch - START_EPOCH))
            echo "  Found file within buffer: $filename (starts ${delay}s from event start)"
        fi
    done <<< "$FILE_LIST"
fi

if [[ ${#RELEVANT_FILES[@]} -eq 0 ]]; then
    echo "No files found that overlap with the specified time range"
    exit 1
fi

# Sort files by timestamp
IFS=$'\n' RELEVANT_FILES=($(sort <<<"${RELEVANT_FILES[*]}"))
unset IFS

echo "Found ${#RELEVANT_FILES[@]} relevant files"

# Download relevant files
echo "Downloading files from camera..."
for file in "${RELEVANT_FILES[@]}"; do
    filename=$(basename "$file")
    echo "  Downloading $filename..."
    
    # Try scp with legacy mode first
    if ! scp -O "${SSH_USER}@${CAMERA_IP}:${file}" "$LOCAL_TEMP_DIR/" 2>/dev/null; then
        # Fallback to using ssh with cat for transfer
        echo "    SCP failed, using SSH+cat fallback..."
        ssh "${SSH_USER}@${CAMERA_IP}" "cat '${file}'" > "$LOCAL_TEMP_DIR/$filename"
        
        # Verify the file was downloaded successfully
        if [[ ! -s "$LOCAL_TEMP_DIR/$filename" ]]; then
            echo "    Error: Failed to download $filename"
            exit 1
        fi
    fi
done

# Create file list for ffmpeg
FILELIST="$LOCAL_TEMP_DIR/filelist.txt"
> "$FILELIST"  # Clear the file first
for file in "${RELEVANT_FILES[@]}"; do
    filename=$(basename "$file")
    echo "file '$filename'" >> "$FILELIST"
done

echo "Concatenating videos..."

# Change to temp directory so relative paths work
cd "$LOCAL_TEMP_DIR"

# First, concatenate all files
TEMP_CONCAT="temp_concat.mp4"
ffmpeg -f concat -safe 0 -i "filelist.txt" -c copy "$TEMP_CONCAT" -y -loglevel warning -fflags +genpts

# Calculate trim times
FIRST_FILE=$(basename "${RELEVANT_FILES[0]}")
LAST_FILE=$(basename "${RELEVANT_FILES[-1]}")

FIRST_FILE_START=$(filename_to_epoch "$FIRST_FILE")
LAST_FILE_START=$(filename_to_epoch "$LAST_FILE")

# Calculate start trim (seconds into first file)
START_TRIM=$((START_EPOCH - FIRST_FILE_START))
if [[ $START_TRIM -lt 0 ]]; then START_TRIM=0; fi

# Calculate end trim (seconds into last file)
END_TRIM=$((END_EPOCH - LAST_FILE_START))
if [[ $END_TRIM -gt $CLIP_DURATION_SECONDS ]]; then END_TRIM=$CLIP_DURATION_SECONDS; fi
if [[ $END_TRIM -lt 0 ]]; then END_TRIM=0; fi

# Calculate total duration to trim to
TOTAL_DURATION=$((END_EPOCH - START_EPOCH))

echo "Debug information:"
echo "  Event start epoch: $START_EPOCH ($(date -d @$START_EPOCH))"
echo "  Event end epoch: $END_EPOCH ($(date -d @$END_EPOCH))"
echo "  First file: $FIRST_FILE"
echo "  First file start epoch: $FIRST_FILE_START ($(date -d @$FIRST_FILE_START))"
echo "  Last file: $LAST_FILE"
echo "  Last file start epoch: $LAST_FILE_START ($(date -d @$LAST_FILE_START))"
echo ""
echo "Trimming calculations:"
echo "  Start trim: ${START_TRIM}s from beginning of first file"
echo "  Total duration: ${TOTAL_DURATION}s"
echo "  Expected result: $(date -d @$START_EPOCH '+%H:%M:%S') to $(date -d @$END_EPOCH '+%H:%M:%S')"

# Trim the concatenated video to exact event duration
echo "Trimming video to exact event duration (re-encoding for precision)..."

# Convert output file to absolute path before changing directories
if [[ "$OUTPUT_FILE" = /* ]]; then
    # Already absolute path
    ABS_OUTPUT_FILE="$OUTPUT_FILE"
else
    # Convert relative path to absolute
    ABS_OUTPUT_FILE="$(pwd)/$OUTPUT_FILE"
fi

# Build ffmpeg filter chain
FILTER_CHAIN=""

if [[ "$CROP_LEFT_HALF" == "true" ]]; then
    # Crop to left half: crop=width:height:x:y
    # iw/2 = half the input width, ih = full input height, 0:0 = start from top-left
    FILTER_CHAIN="crop=iw/2:ih:0:0"
fi

if [[ "$ROTATE_90_CCW" == "true" ]]; then
    # Add comma separator if we already have filters
    if [[ -n "$FILTER_CHAIN" ]]; then
        FILTER_CHAIN="${FILTER_CHAIN},"
    fi
    # transpose=2 = 90 degrees counter-clockwise
    FILTER_CHAIN="${FILTER_CHAIN}transpose=2"
fi

# Apply filters if any are set
if [[ -n "$FILTER_CHAIN" ]]; then
    echo "Applying video filters: crop left half=${CROP_LEFT_HALF}, rotate 90° CCW=${ROTATE_90_CCW}"
    ffmpeg -i "$TEMP_CONCAT" -ss "$START_TRIM" -t "$TOTAL_DURATION" -vf "$FILTER_CHAIN" -c:v libx264 -c:a aac "$ABS_OUTPUT_FILE" -y -loglevel warning
else
    ffmpeg -i "$TEMP_CONCAT" -ss "$START_TRIM" -t "$TOTAL_DURATION" -c:v libx264 -c:a aac "$ABS_OUTPUT_FILE" -y -loglevel warning
fi

# Return to original directory
cd - > /dev/null

# Get output file info
if [[ -f "$ABS_OUTPUT_FILE" ]]; then
    OUTPUT_SIZE=$(du -h "$ABS_OUTPUT_FILE" | cut -f1)
    OUTPUT_DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$ABS_OUTPUT_FILE" 2>/dev/null | cut -d. -f1)
    echo ""
    echo "✅ Event video created successfully!"
    echo "   File: $ABS_OUTPUT_FILE"
    echo "   Size: $OUTPUT_SIZE"
    echo "   Duration: ${OUTPUT_DURATION}s"
    echo "   Covers: $START_DATETIME to $END_DATETIME"
else
    echo "❌ Error: Output file was not created"
    exit 1
fi