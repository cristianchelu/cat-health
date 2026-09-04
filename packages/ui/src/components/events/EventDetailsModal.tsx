import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Cat,
  Download,
  ImageOff,
  VideoOff,
  MoreVertical,
  Pencil,
  Sparkles,
  Trash2,
  Waves,
} from 'lucide-react';
import { type EventDataDTO, type GetEventListItemDTO } from 'shared';

import { getEventById } from '@/api/pets';
import { reidentifyLitterboxVisits } from '@/api/devices';
import { usePets } from '@/hooks/queries/petQueries';
import { useDevices } from '@/hooks/queries/deviceQueries';
import {
  useAnalyzeLitterboxEvent,
  useEventMedia,
  useUpdateEvent,
  useDeleteEvent,
  invalidateQueriesAfterEventPatch,
} from '@/hooks/queries/eventQueries';
import { DialogTitle } from '@/components/ui/Dialog';
import { Sheet } from '@/components/ui/Sheet';
import { SheetPages } from '@/components/ui/SheetPages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import Avatar from '@/components/ui/Avatar';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { Checkbox } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { causeLabelKey } from '@/lib/eventAttribution';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

import TimelapsePlayer from './TimelapsePlayer';
import { buildTimelapseTimeline } from './buildTimelapseTimeline';
import { decodeLitterboxRawData } from './decodeLitterboxRawData';
import { decodeWaterRawData } from './decodeWaterRawData';
import EventAdvancedDetails, {
  type AdvancedSignal,
} from './EventAdvancedDetails';
import EventFacts from './EventFacts';
import { buildEventFacts } from './buildEventFacts';
import EventCorrectionBand from './EventCorrectionBand';
import EventNoteField from './EventNoteField';
import EventEditForm from './EventEditForm';
import {
  canEditEvent,
  deriveEventCorrection,
  isPetEvent,
} from './eventCorrection';
import './EventDetailsModal.css';

/** Event variants that carry a duration (seconds). */
function getEventDurationSeconds(data: EventDataDTO): number | undefined {
  switch (data.type) {
    case 'water_intake':
    case 'litterbox_use':
      return data.duration;
    default:
      return undefined;
  }
}

interface EventDetailsModalProps {
  /** Usually a list row — no `raw_data`; the modal fetches the full event by id for signal decoding. */
  event: GetEventListItemDTO | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * One event, read.
 *
 * The surface is a sentence, the readings behind it, and — only where the
 * machine guessed — one band that asks once whether the guess was right. Every
 * correction goes through the edit form; nothing else on the body is
 * interactive, and nothing here commits on its own.
 *
 * One word for it everywhere — Edit — and one fixed home: the kebab, on every
 * event the form can serve, so the way in never has to be hunted for. While
 * the machine guessed and is still asking, the band offers the same door
 * beside "Looks right" — an invitation next to the question, not a second
 * destination.
 */
const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { data: pets } = usePets();
  const { data: devices } = useDevices();

  /*
   * The host clears its selection the moment the drawer closes, but the drawer
   * still has an exit animation to play and needs something to play it with.
   * Hold the last event on screen until it is off.
   */
  const [shownEvent, setShownEvent] = React.useState(event);
  if (event && event !== shownEvent) setShownEvent(event);

  const { data: media, isLoading: isLoadingMedia } = useEventMedia(
    shownEvent?.id ?? 0,
    isOpen && shownEvent !== null,
  );
  const { mutateAsync: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutate: deleteEventMutation, isPending: isDeleting } =
    useDeleteEvent();
  const { mutate: runAnalyze, isPending: isAnalyzing } =
    useAnalyzeLitterboxEvent();

  const eventId = shownEvent?.id;
  const { data: eventFromServer } = useQuery({
    queryKey: ['event', eventId ?? 0],
    queryFn: () => getEventById(eventId!),
    enabled: Boolean(isOpen && eventId),
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [reidentifyOnDelete, setReidentifyOnDelete] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  /* Set by the edit level so Escape steps back one rung of the ladder — out of
     a picker, then out of the form — rather than dropping the whole drawer. */
  const editBackRef = React.useRef<(() => boolean) | null>(null);
  const [isNoteDirty, setIsNoteDirty] = React.useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false);

  /** Prefer React Query payload so the modal stays in sync after mutations (e.g. reanalyze) while `event` from parent state may be stale. */
  const displayEvent = shownEvent ? (eventFromServer ?? shownEvent) : null;
  const children =
    eventFromServer && 'children' in eventFromServer
      ? eventFromServer.children
      : undefined;

  /**
   * `event` is a list row without `raw_data`; only the detail fetch carries
   * the signal. Decoded once here because both the menu entry and the page it
   * opens are answering the same question — is there a trace to look at —
   * and two decodes could answer it differently.
   */
  const advancedSignal = React.useMemo<AdvancedSignal | null>(() => {
    const raw = eventFromServer?.raw_data;
    switch (displayEvent?.data?.type) {
      case 'litterbox_use': {
        const decoded = decodeLitterboxRawData(raw);
        return decoded && decoded.weights.length > 0
          ? { type: 'litterbox_use', decoded }
          : null;
      }
      case 'water_intake': {
        const decoded = decodeWaterRawData(raw);
        return decoded && decoded.weights.length > 0
          ? { type: 'water_intake', decoded }
          : null;
      }
      default:
        return null;
    }
  }, [displayEvent, eventFromServer]);

  const hasLitterboxChartWeights = advancedSignal?.type === 'litterbox_use';

  /*
   * Every visit starts on the read surface with nothing carried over from the
   * last one — reset on arrival, never on the way out. On the way out the
   * drawer is still sliding, and clearing `isEditing` there would have it walk
   * back down its own ladder in full view. An effect would be a frame too
   * late for the same reason, so this is the render-phase pattern
   * `SheetPages` uses.
   */
  const [visit, setVisit] = React.useState({
    open: isOpen,
    id: event?.id ?? null,
  });
  if (isOpen !== visit.open || (isOpen && (event?.id ?? null) !== visit.id)) {
    setVisit({ open: isOpen, id: event?.id ?? null });
    if (isOpen) {
      setShowDeleteConfirm(false);
      setReidentifyOnDelete(false);
      setIsEditing(false);
      setShowAdvanced(false);
      setIsNoteDirty(false);
      setShowDiscardConfirm(false);
    }
  }

  const hasMedia = Boolean(media?.length);

  const { imageFrames, videoItems, hasTimelapse } = React.useMemo(() => {
    if (!media?.length) {
      return { imageFrames: [], videoItems: [], hasTimelapse: false };
    }

    const images = media.filter((m) => m.mime_type.startsWith('image/'));
    const videos = media.filter((m) => m.mime_type.startsWith('video/'));
    const timelapse =
      images.length > 1 || images.some((m) => m.relation === 'timelapse');

    return { imageFrames: images, videoItems: videos, hasTimelapse: timelapse };
  }, [media]);

  const timelapseTimeline = React.useMemo(() => {
    const eventDurationSec = displayEvent
      ? getEventDurationSeconds(displayEvent.data)
      : undefined;
    return buildTimelapseTimeline(imageFrames, eventDurationSec);
  }, [displayEvent, imageFrames]);

  const downloadMediaPath = imageFrames[0]?.file_path ?? media?.[0]?.file_path;

  if (!shownEvent || !displayEvent) {
    return null;
  }

  const pet =
    displayEvent.pet_id != null
      ? pets?.find((p) => p.id === displayEvent.pet_id)
      : undefined;
  const device =
    displayEvent.device_id != null
      ? devices?.find((d) => d.id === displayEvent.device_id)
      : undefined;

  const correction = deriveEventCorrection(displayEvent);

  /*
   * A camera on the device is what makes a missing clip worth showing. With
   * one, an empty stage is a failure — the recording that should exist does
   * not. Without one there was never going to be a clip, so the surface simply
   * starts at the title.
   *
   * Gating on the camera rather than on the fetch is also what stops the flash:
   * keying the stage off `isLoadingMedia` painted a black box on every event
   * and then tore it down a moment later.
   */
  const hasCamera = device?.camera_link != null;
  const showsStage = hasCamera || hasMedia;

  /**
   * Who the event is about. A settled non-pet cause is a subject too — naming
   * the robot vacuum is the whole point of having the cause.
   */
  const subject =
    displayEvent.caused_by === 'pet'
      ? (pet?.name ?? t(causeLabelKey('pet')))
      : displayEvent.caused_by === 'unknown'
        ? null
        : t(causeLabelKey(displayEvent.caused_by));

  /*
   * The title names the kind of event and nothing else. It used to be a
   * sentence — "Jazz used the litter box" — which reads well until the cat is
   * called Sir Thomas The Stinky, and which asks every translation to carry
   * English subject-verb grammar. The cat moved to where every other fact
   * about the event already lives.
   */
  const title = t(`event_details.title_${displayEvent.data.type}`);

  /* One glyph either way — a person settled it. Which way they settled it is
     the badge's name, not a second mark. */
  const settledLabelKey =
    correction.kind === 'settled' && correction.how === 'corrected'
      ? 'event_details.corrected_by_you'
      : 'event_details.verified_by_you';

  const facts = buildEventFacts({ event: displayEvent, children, t });

  /*
   * The subject is a reading like any other, so it takes a slot rather than
   * the headline — its glyph is the cat's own face, which is a better label
   * than any word for it.
   */
  if (isPetEvent(displayEvent.data.type)) {
    facts.unshift({
      key: 'subject',
      tone:
        subject && displayEvent.caused_by === 'pet' ? 'identity' : 'neutral',
      glyph:
        displayEvent.caused_by === 'pet' ? (
          <Avatar
            size="sm"
            src={pet?.avatar_url}
            alt=""
            fallbackIcon={<Cat size={16} aria-hidden />}
          />
        ) : (
          <Cat aria-hidden />
        ),
      value: subject ?? t('event_details.fact_cat_unidentified'),
      label: t('event_details.fact_cat'),
    });
  }

  /** The band is on screen, so it owns the restatement of what was guessed. */
  const isAsking = correction.kind === 'guess' || correction.kind === 'assign';

  const canDiscardCleanly = !isNoteDirty;
  const handleClose = () => {
    if (canDiscardCleanly) onClose();
    else setShowDiscardConfirm(true);
  };

  const handleVerify = () => {
    void updateEvent({
      eventId: displayEvent.id,
      data: { human_verified: true },
    }).catch(() => {
      // Nothing was recorded, so the band simply stays and can be answered
      // again — there is no half-verified state to explain.
    });
  };

  const handleSaveNote = (note: string) =>
    updateEvent({ eventId: displayEvent.id, data: { note } });

  const handleDeleteConfirm = async () => {
    const deviceId = displayEvent.device_id;
    const after = displayEvent.timestamp;
    const shouldReidentify = reidentifyOnDelete;

    deleteEventMutation(displayEvent.id, {
      onSuccess: async () => {
        /* The drawer outlives its own close now, so this dialog is no longer
           swept away with it — and a confirm left open over a deleted event
           offers to delete it a second time. */
        setShowDeleteConfirm(false);
        setReidentifyOnDelete(false);
        if (shouldReidentify && deviceId != null) {
          await reidentifyLitterboxVisits(deviceId, after);
          invalidateQueriesAfterEventPatch(queryClient, displayEvent);
          await queryClient.invalidateQueries({
            queryKey: ['litterboxTrends'],
          });
        }
        onClose();
      },
    });
  };

  const menuHasEdit = canEditEvent(displayEvent);
  /* Delete gets a section of its own only when something sits above it — a
     separator with nothing over it reads as a stray rule at the menu's top. */
  const menuHasMoreThanDelete =
    menuHasEdit ||
    advancedSignal != null ||
    hasLitterboxChartWeights ||
    (hasMedia && downloadMediaPath != null);

  /* One ladder. The edit form and the advanced page are both rung 1 off the
     read surface, and neither is reachable from the other. */
  const page = isEditing
    ? 'edit'
    : advancedSignal && showAdvanced
      ? 'advanced'
      : 'read';

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => !open && handleClose()}
        /*
         * Phone: an unsaved note takes the drag and the scrim off the table —
         * vaul cannot be vetoed after the fact, so the guard has to be
         * declared up front rather than answered when it fires.
         *
         * That leaves no way out of the drawer while a note is open, which is
         * the point: the way out is the note's own Cancel, which is on screen
         * beside the text it would throw away and names what it discards.
         * Desktop keeps Escape and the scrim, which Radix does let us veto, so
         * both still route to the discard dialog.
         */
        dismissible={canDiscardCleanly}
        className="event-details-modal"
        onEscapeKeyDown={(escape) => {
          /* One rung at a time: out of a picker, then out of the form, and
             only from the read surface does Escape close the drawer. */
          if (editBackRef.current?.()) escape.preventDefault();
          else if (isEditing) {
            escape.preventDefault();
            setIsEditing(false);
          } else if (showAdvanced) {
            escape.preventDefault();
            setShowAdvanced(false);
          }
        }}
      >
        {/* The whole surface travels, stage included: it is one page turning
            into another, not a panel swapped under a fixed header. */}
        <SheetPages page={page} depth={page === 'read' ? 0 : 1}>
          {advancedSignal && showAdvanced && !isEditing ? (
            <EventAdvancedDetails
              event={displayEvent}
              signal={advancedSignal}
              deviceName={device?.name}
              onBack={() => setShowAdvanced(false)}
            />
          ) : isEditing ? (
            <EventEditForm
              event={displayEvent}
              eventChildren={children}
              onClose={() => setIsEditing(false)}
              registerBack={(back) => {
                editBackRef.current = back;
              }}
            />
          ) : (
            <>
              {/*
               * Media only. The signal chart used to share this space behind a
               * Media|Analysis tab strip, which read as chrome bolted onto the top
               * of the sheet — worse on a phone, where it sat where the grabber
               * belongs. The signal wanted a surface of its own rather than half
               * of this one, and it has one: `EventAdvancedDetails`, a rung in
               * off the kebab.
               *
               * No clip means no stage at all: the surface starts at the headline
               * rather than opening on an empty black box.
               */}
              {showsStage && (
                <div className="event-details-stage">
                  {isLoadingMedia && (
                    <div className="event-details-stage-note">
                      <Spinner size={24} />
                    </div>
                  )}
                  {!isLoadingMedia && !hasMedia && (
                    /* The camera tab's own glyph for "nothing to show", and
                         nothing else: the empty stage is the message. */
                    <div
                      className="event-details-stage-note"
                      title={t('event_details.no_recording')}
                      aria-label={t('event_details.no_recording')}
                    >
                      <VideoOff size={28} aria-hidden="true" />
                    </div>
                  )}
                  {!isLoadingMedia && hasMedia && (
                    <div className="event-details-media-stack">
                      {timelapseTimeline && (
                        <TimelapsePlayer
                          frames={timelapseTimeline.frames}
                          durationSec={timelapseTimeline.durationSec}
                          intervalSec={timelapseTimeline.intervalSec}
                          alt={t('event_details.event_media_alt')}
                        />
                      )}
                      {imageFrames.length === 1 && !hasTimelapse && (
                        <div className="event-details-media-still">
                          <FallbackImage
                            src={`api/media/${imageFrames[0].file_path}`}
                            alt={t('event_details.event_media_alt')}
                            fit="contain"
                            fallback={<ImageOff size={24} aria-hidden="true" />}
                          />
                        </div>
                      )}
                      {videoItems.map((m) => (
                        <div
                          key={m.id}
                          className="event-details-media-video"
                          /* Native video controls scrub horizontally but are
                               neither a scroller nor a form control, so the
                               drawer would otherwise win the gesture. */
                          data-vaul-no-drag=""
                        >
                          <video controls src={`api/media/${m.file_path}`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="event-details-surface">
                <div className="event-details-header">
                  <div className="event-details-identity">
                    <DialogTitle className="event-details-title">
                      {title}
                      {/* The timeline's own verified glyph, sized to the line
                            it sits on — a settled event is a quiet fact, not an
                            announcement. */}
                      {correction.kind === 'settled' && (
                        <span
                          className="event-details-verified"
                          title={t(settledLabelKey)}
                          aria-label={t(settledLabelKey)}
                        >
                          <BadgeCheck aria-hidden />
                        </span>
                      )}
                    </DialogTitle>
                    <div className="event-details-meta">
                      <span>
                        {formatDateTime(new Date(displayEvent.timestamp))}
                      </span>
                      {device && <span>{device.name}</span>}
                    </div>
                  </div>

                  <div className="event-details-actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          icon
                          title={t('event_details.more_actions')}
                          aria-label={t('event_details.more_actions')}
                        >
                          <MoreVertical size={18} aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {menuHasEdit && (
                          /* Same rung as Advanced details below, so it takes
                             the same chevron: both walk you onto another
                             surface rather than doing something and closing. */
                          <DropdownMenuItem
                            opensPage
                            onSelect={() => setIsEditing(true)}
                          >
                            <Pencil size={15} aria-hidden />
                            {t('common.edit')}
                          </DropdownMenuItem>
                        )}
                        {advancedSignal && (
                          /* Reads as a place rather than an action, so it
                             takes the chevron the pickers take. */
                          <DropdownMenuItem
                            opensPage
                            onSelect={() => setShowAdvanced(true)}
                          >
                            <Waves size={15} aria-hidden />
                            {t('event_details.advanced_details')}
                          </DropdownMenuItem>
                        )}
                        {hasLitterboxChartWeights && (
                          /* TODO: Hide for devices with visit annotation off — needs device context on the event (or similar) without an extra device fetch. */
                          <DropdownMenuItem
                            disabled={isAnalyzing}
                            onSelect={() => runAnalyze(displayEvent.id)}
                          >
                            <Sparkles size={15} aria-hidden />
                            {t('event_details.analyze')}
                          </DropdownMenuItem>
                        )}
                        {hasMedia && downloadMediaPath && (
                          <DropdownMenuItem
                            onSelect={() => {
                              const link = document.createElement('a');
                              link.href = `api/media/${downloadMediaPath}`;
                              link.download =
                                downloadMediaPath.split('/').pop() || 'media';
                              link.click();
                            }}
                          >
                            <Download size={15} aria-hidden />
                            {t('event_details.download_media')}
                          </DropdownMenuItem>
                        )}
                        {menuHasMoreThanDelete && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          tone="danger"
                          disabled={isDeleting}
                          onSelect={() => {
                            setShowDeleteConfirm(true);
                            setReidentifyOnDelete(false);
                          }}
                        >
                          <Trash2 size={15} aria-hidden />
                          {t('event_details.delete_event')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <EventFacts facts={facts} />

                {isAsking && (
                  <EventCorrectionBand
                    variant={correction.kind}
                    subject={subject ?? undefined}
                    basis={
                      displayEvent.attributed_by
                        ? t(
                            `event_details.band_basis_${displayEvent.attributed_by}`,
                          )
                        : undefined
                    }
                    isBusy={isUpdating}
                    onVerify={handleVerify}
                    onEdit={() => setIsEditing(true)}
                  />
                )}

                <EventNoteField
                  note={displayEvent.note}
                  noteUpdatedAt={displayEvent.note_updated_at}
                  onSave={handleSaveNote}
                  onDirtyChange={setIsNoteDirty}
                />
              </div>
            </>
          )}
        </SheetPages>
      </Sheet>

      <DiscardUnsavedDialog
        open={showDiscardConfirm}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setIsNoteDirty(false);
          onClose();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('event_details.delete_visit')}
        description={t('event_details.confirm_delete_visit')}
        confirmLabel={t('event_details.delete_visit')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isConfirming={isDeleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setReidentifyOnDelete(false);
        }}
      >
        <Checkbox
          checked={reidentifyOnDelete}
          onCheckedChange={setReidentifyOnDelete}
          disabled={isDeleting || displayEvent.device_id == null}
          label={t('event_details.reidentify_later_visits')}
        />
      </ConfirmDialog>
    </>
  );
};

export default EventDetailsModal;
