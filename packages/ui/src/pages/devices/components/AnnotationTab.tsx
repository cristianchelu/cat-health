import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { getEventById } from '@/api/pets';
import { useDeviceAnnotationEvents } from '@/hooks/queries/deviceQueries';
import { usePets } from '@/hooks/queries/petQueries';
import type { GetEventDTO, LitterboxUseEliminationType } from 'shared';
import type { LitterboxAnnotation } from '@/types/litterbox';
import AnnotationWorkspace, { type AnnotationWorkspaceActions } from './AnnotationWorkspace';
import './AnnotationTab.css';
import { CheckCheck, ListChecks, CircleDot, Ban } from 'lucide-react';
import { format } from 'date-fns';

type VerifiedFilter = 'all' | 'verified' | 'unverified';
type EliminationFilter = LitterboxUseEliminationType | 'all';

const ELIMINATION_TYPES: LitterboxUseEliminationType[] = [
  'urination',
  'defecation',
  'both',
  'no_elimination',
  'unknown',
];

function getAnnotationStatus(event: GetEventDTO): 'excluded' | 'bout' | 'session' | 'none' {
  const d = event.data as { annotation?: LitterboxAnnotation };
  if (d.annotation?.excluded === true) return 'excluded';
  if (!event.human_verified) return 'none';
  if (d.annotation?.bouts && d.annotation.bouts.length > 0) return 'bout';
  return 'session';
}

interface AnnotationTabProps {
  deviceId: number;
}

const EVENT_QUERY_KEY = 'event';
/** `video=1` — media panel open (shareable with `event` id). */
const VIDEO_QUERY_KEY = 'video';
const VERIFIED_QUERY_KEY = 'verified';
const ELIM_QUERY_KEY = 'elim';
const PAGE_QUERY_KEY = 'page';

const LIMIT = 200;

function parseEventIdParam(raw: string | null): number | null {
  if (raw == null || raw === '') return null;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseVerifiedFilterParam(raw: string | null): VerifiedFilter {
  if (raw === 'verified' || raw === 'unverified') return raw;
  return 'all';
}

function parseElimFilterParam(raw: string | null): EliminationFilter {
  if (raw == null || raw === '' || raw === 'all') return 'all';
  if ((ELIMINATION_TYPES as readonly string[]).includes(raw)) {
    return raw as LitterboxUseEliminationType;
  }
  return 'all';
}

/** 1-based page from URL; invalid or missing → 1 */
function parsePageParam(raw: string | null): number {
  if (raw == null || raw === '') return 1;
  const p = Number.parseInt(raw, 10);
  if (!Number.isFinite(p) || p < 1) return 1;
  return p;
}

const AnnotationTab: React.FC<AnnotationTabProps> = ({ deviceId }) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedEventId = React.useMemo(
    () => parseEventIdParam(searchParams.get(EVENT_QUERY_KEY)),
    [searchParams],
  );

  const setSelectedEventId = React.useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id == null) next.delete(EVENT_QUERY_KEY);
          else next.set(EVENT_QUERY_KEY, String(id));
          next.delete(VIDEO_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** Drop a malformed `event` query value (e.g. non-numeric). */
  React.useEffect(() => {
    const raw = searchParams.get(EVENT_QUERY_KEY);
    if (raw == null || raw === '') return;
    if (parseEventIdParam(raw) == null) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(EVENT_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  /** Changing device should not keep another device’s event id in the URL. */
  const prevDeviceIdRef = React.useRef(deviceId);
  React.useEffect(() => {
    if (prevDeviceIdRef.current === deviceId) return;
    prevDeviceIdRef.current = deviceId;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(EVENT_QUERY_KEY);
        next.delete(VIDEO_QUERY_KEY);
        return next;
      },
      { replace: true },
    );
  }, [deviceId, setSearchParams]);

  /** Only `video=1` is valid; drop garbage values. */
  React.useEffect(() => {
    const raw = searchParams.get(VIDEO_QUERY_KEY);
    if (raw == null || raw === '') return;
    if (raw !== '1') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(VIDEO_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  /** Remove unknown `verified` query values */
  React.useEffect(() => {
    const raw = searchParams.get(VERIFIED_QUERY_KEY);
    if (raw == null || raw === '') return;
    if (raw !== 'verified' && raw !== 'unverified' && raw !== 'all') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(VERIFIED_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  /** Remove unknown `elim` query values */
  React.useEffect(() => {
    const raw = searchParams.get(ELIM_QUERY_KEY);
    if (raw == null || raw === '') return;
    if (raw !== 'all' && !(ELIMINATION_TYPES as readonly string[]).includes(raw)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(ELIM_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  /** Drop invalid `page` (non-integer or less than 1) */
  React.useEffect(() => {
    const raw = searchParams.get(PAGE_QUERY_KEY);
    if (raw == null || raw === '') return;
    const p = Number.parseInt(raw, 10);
    if (!Number.isFinite(p) || p < 1) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(PAGE_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  const verifiedFilter = parseVerifiedFilterParam(searchParams.get(VERIFIED_QUERY_KEY));
  const elimFilter = parseElimFilterParam(searchParams.get(ELIM_QUERY_KEY));
  const page = parsePageParam(searchParams.get(PAGE_QUERY_KEY));
  const offset = (page - 1) * LIMIT;

  const setVerifiedFilter = React.useCallback(
    (v: VerifiedFilter) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === 'all') next.delete(VERIFIED_QUERY_KEY);
          else next.set(VERIFIED_QUERY_KEY, v);
          next.delete(PAGE_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setElimFilter = React.useCallback(
    (v: EliminationFilter) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === 'all') next.delete(ELIM_QUERY_KEY);
          else next.set(ELIM_QUERY_KEY, v);
          next.delete(PAGE_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const goToPage = React.useCallback(
    (nextPage: number) => {
      const p = Math.max(1, nextPage);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (p <= 1) next.delete(PAGE_QUERY_KEY);
          else next.set(PAGE_QUERY_KEY, String(p));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const workspaceActionsRef = React.useRef<AnnotationWorkspaceActions | null>(null);

  const videoOpen = searchParams.get(VIDEO_QUERY_KEY) === '1';

  const setVideoOpen = React.useCallback(
    (open: boolean) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (open) next.set(VIDEO_QUERY_KEY, '1');
          else next.delete(VIDEO_QUERY_KEY);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const queryOpts = React.useMemo(() => {
    const opts: { limit: number; offset: number; human_verified?: boolean } = {
      limit: LIMIT,
      offset,
    };
    if (verifiedFilter === 'verified') opts.human_verified = true;
    if (verifiedFilter === 'unverified') opts.human_verified = false;
    return opts;
  }, [verifiedFilter, offset]);

  const { data: eventsPage, isLoading } = useDeviceAnnotationEvents(deviceId, queryOpts);
  const { data: pets } = usePets();

  const petMap = React.useMemo(() => {
    const m = new Map<number, string>();
    pets?.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [pets]);

  const filteredEvents = React.useMemo(() => {
    if (!eventsPage?.data) return [];
    return eventsPage.data.filter((e) => {
      if (e.data.type !== 'litterbox_use') return false;
      if (elimFilter === 'all') return true;
      return (e.data as { elimination_type?: string }).elimination_type === elimFilter;
    });
  }, [eventsPage, elimFilter]);

  /** Current page payload may include the selected id even when client `elim` hides it from `filteredEvents`. */
  const litterboxEventOnPage = React.useMemo(() => {
    if (selectedEventId == null || !eventsPage?.data) return undefined;
    return eventsPage.data.find(
      (e) =>
        e.id === selectedEventId &&
        (e.data as { type?: string }).type === 'litterbox_use',
    );
  }, [eventsPage, selectedEventId]);

  const shouldFetchSelectedEventById =
    selectedEventId != null &&
    !isLoading &&
    eventsPage !== undefined &&
    litterboxEventOnPage === undefined;

  const {
    data: selectedEventFetched,
    isPending: isPendingSelectedEventDetail,
  } = useQuery({
    queryKey: ['event', selectedEventId],
    queryFn: () => getEventById(selectedEventId!),
    enabled: shouldFetchSelectedEventById,
  });

  const selectedEvent = React.useMemo((): GetEventDTO | null => {
    if (selectedEventId == null) return null;
    if (litterboxEventOnPage) return litterboxEventOnPage;
    if (selectedEventFetched) {
      if (selectedEventFetched.device_id !== deviceId) return null;
      if ((selectedEventFetched.data as { type?: string }).type !== 'litterbox_use') {
        return null;
      }
      return selectedEventFetched;
    }
    return null;
  }, [selectedEventId, litterboxEventOnPage, selectedEventFetched, deviceId]);

  const workspaceAwaitingSelection =
    selectedEventId != null &&
    selectedEvent == null &&
    (isLoading || (shouldFetchSelectedEventById && isPendingSelectedEventDetail));

  const handleNavigate = React.useCallback(
    (direction: 'prev' | 'next') => {
      if (!selectedEventId) return;
      const idx = filteredEvents.findIndex((e) => e.id === selectedEventId);
      if (idx === -1) return;
      const next = direction === 'next' ? filteredEvents[idx + 1] : filteredEvents[idx - 1];
      if (next) setSelectedEventId(next.id);
    },
    [filteredEvents, selectedEventId, setSelectedEventId],
  );

  const handleAfterConvertToMaintenance = React.useCallback(() => {
    if (selectedEventId == null) return;
    const idx = filteredEvents.findIndex((e) => e.id === selectedEventId);
    if (idx === -1) {
      setSelectedEventId(null);
      return;
    }
    const next = filteredEvents[idx + 1] ?? filteredEvents[idx - 1];
    setSelectedEventId(next?.id ?? null);
  }, [filteredEvents, selectedEventId, setSelectedEventId]);

  const listRef = React.useRef<HTMLUListElement>(null);
  /** When true, the next list scroll-into-view for the selected row is skipped (direct row click). */
  const suppressNextSelectedRowScrollRef = React.useRef(false);

  const handleListKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!filteredEvents.length) return;
      const idx = filteredEvents.findIndex((ev) => ev.id === selectedEventId);
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const next = filteredEvents[Math.min(idx + 1, filteredEvents.length - 1)];
        if (next) setSelectedEventId(next.id);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prev = filteredEvents[Math.max(idx - 1, 0)];
        if (prev) setSelectedEventId(prev.id);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        handleNavigate('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        handleNavigate('prev');
      }
    },
    [filteredEvents, selectedEventId, handleNavigate, setSelectedEventId],
  );

  const totalPages = eventsPage ? Math.ceil(eventsPage.total / LIMIT) : 1;
  const currentPage = page;

  /** If `page` in the URL is past the last page (e.g. fewer events after a filter), clamp it */
  React.useEffect(() => {
    if (isLoading || eventsPage == null) return;
    const tp = Math.max(1, Math.ceil(eventsPage.total / LIMIT));
    if (page > tp) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tp <= 1) next.delete(PAGE_QUERY_KEY);
          else next.set(PAGE_QUERY_KEY, String(tp));
          return next;
        },
        { replace: true },
      );
    }
  }, [isLoading, eventsPage, page, setSearchParams]);

  const eventNavIndex = filteredEvents.findIndex((e) => e.id === selectedEventId);

  React.useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      return target.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!selectedEventId) return;
      if (e.defaultPrevented) return;
      if (!filteredEvents.length) return;

      const editable = isEditableTarget(e.target);

      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;

      // Navigation (always allowed)
      if (lower === 'n') {
        e.preventDefault();
        handleNavigate('next');
        return;
      }
      if (lower === 'p') {
        e.preventDefault();
        handleNavigate('prev');
        return;
      }

      // Prevent destructive/typing shortcuts while interacting with inputs/selects
      if (editable) return;

      if (lower === 'v') {
        e.preventDefault();
        if (e.shiftKey) {
          void workspaceActionsRef.current?.toggleVerified();
        } else {
          workspaceActionsRef.current?.toggleVideo();
        }
        return;
      }

      if (lower === 'x') {
        e.preventDefault();
        void workspaceActionsRef.current?.toggleExcluded();
        return;
      }

      if (lower === 's') {
        e.preventDefault();
        workspaceActionsRef.current?.toggleStraining();
        return;
      }

      if (e.shiftKey && lower === 'm') {
        e.preventDefault();
        void workspaceActionsRef.current?.convertToMaintenance();
        return;
      }

      if (lower === 'g' || (e.ctrlKey && key === 'Enter')) {
        e.preventDefault();
        void workspaceActionsRef.current?.setVerified(true).then(() => {
          handleNavigate('next');
        });
        return;
      }

      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        workspaceActionsRef.current?.deleteSelectedBout();
        return;
      }

      if (key === '[') {
        e.preventDefault();
        workspaceActionsRef.current?.selectAdjacentBout(-1);
        return;
      }
      if (key === ']') {
        e.preventDefault();
        workspaceActionsRef.current?.selectAdjacentBout(1);
        return;
      }

      if (key === 'Escape') {
        e.preventDefault();
        workspaceActionsRef.current?.clearSelection();
        return;
      }

      if (key === '1') {
        e.preventDefault();
        workspaceActionsRef.current?.setSelectedBoutType('urination');
        return;
      }
      if (key === '2') {
        e.preventDefault();
        workspaceActionsRef.current?.setSelectedBoutType('defecation');
        return;
      }
      if (key === '3') {
        e.preventDefault();
        workspaceActionsRef.current?.setSelectedBoutType('unknown');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [filteredEvents.length, handleNavigate, selectedEventId]);

  const listLoadingInitial = isLoading && eventsPage === undefined;

  /** Keep the selected row in view when selection changes via keyboard, URL, nav buttons, etc. — not when clicking a row. */
  React.useLayoutEffect(() => {
    if (selectedEventId == null || listLoadingInitial) return;
    if (suppressNextSelectedRowScrollRef.current) {
      suppressNextSelectedRowScrollRef.current = false;
      return;
    }
    const root = listRef.current;
    if (!root) return;
    if (!filteredEvents.some((e) => e.id === selectedEventId)) return;
    const el = root.querySelector(`[data-event-id="${String(selectedEventId)}"]`);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, [selectedEventId, listLoadingInitial, filteredEvents]);

  return (
    <div className="annotation-tab">
      <div className="annotation-tab-list">
        {filteredEvents.length > 1 && (
          <div className="annotation-list-event-nav">
            <button
              type="button"
              className="annotation-event-nav-btn"
              disabled={eventNavIndex <= 0}
              onClick={() => handleNavigate('prev')}
              aria-label={t('annotation.prev_event')}
            >
              ‹ {t('annotation.prev_event')}
            </button>
            <button
              type="button"
              className="annotation-event-nav-btn"
              disabled={eventNavIndex < 0 || eventNavIndex >= filteredEvents.length - 1}
              onClick={() => handleNavigate('next')}
              aria-label={t('annotation.next_event')}
            >
              {t('annotation.next_event')} ›
            </button>
          </div>
        )}

        <div className="annotation-list-filters">
          <select
            className="annotation-filter-select"
            value={verifiedFilter}
            onChange={(e) => { setVerifiedFilter(e.target.value as VerifiedFilter); }}
          >
            <option value="all">{t('annotation.filter_all')}</option>
            <option value="verified">{t('annotation.filter_verified_only')}</option>
            <option value="unverified">{t('annotation.filter_unverified_only')}</option>
          </select>
          <select
            className="annotation-filter-select"
            value={elimFilter}
            onChange={(e) => { setElimFilter(e.target.value as EliminationFilter); }}
          >
            <option value="all">{t('annotation.filter_all_types')}</option>
            {ELIMINATION_TYPES.map((et) => (
              <option key={et} value={et}>{t(`overview.${et}`)}</option>
            ))}
          </select>
        </div>

        <div className="annotation-list-count">
          {isLoading
            ? t('devices.loading_events')
            : t('annotation.event_count', { count: eventsPage?.total ?? 0 })}
        </div>

        <ul
          className="annotation-list-items"
          ref={listRef}
          onKeyDown={handleListKeyDown}
          tabIndex={0}
          role="listbox"
        >
          {listLoadingInitial ? (
            <li className="annotation-list-loading" role="status">
              {t('devices.loading_events')}
            </li>
          ) : (
            <>
              {filteredEvents.map((event) => {
                const d = event.data as { elimination_type?: LitterboxUseEliminationType };
                const status = getAnnotationStatus(event);
                const statusLabel =
                  status === 'excluded'
                    ? t('annotation.status_excluded')
                    : status === 'bout'
                      ? t('annotation.status_bout')
                      : status === 'session'
                        ? t('annotation.status_session')
                        : t('annotation.status_none');
                const petName = event.pet_id ? petMap.get(event.pet_id) : undefined;
                const isSelected = event.id === selectedEventId;

                return (
                  <li
                    key={event.id}
                    data-event-id={event.id}
                    className={`annotation-list-item${isSelected ? ' selected' : ''}`}
                    onClick={() => {
                      if (event.id !== selectedEventId) {
                        suppressNextSelectedRowScrollRef.current = true;
                      }
                      setSelectedEventId(event.id);
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                  >
                    <div className="annotation-item-header">
                      <span className="annotation-item-time">
                        {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                      </span>
                      <span
                        className={`annotation-item-status status-${status}`}
                        title={statusLabel}
                        aria-label={statusLabel}
                      >
                        {status === 'excluded' && <Ban size={14} aria-hidden />}
                        {status === 'bout' && <ListChecks size={14} aria-hidden />}
                        {status === 'session' && <CheckCheck size={14} aria-hidden />}
                        {status === 'none' && <CircleDot size={14} aria-hidden />}
                      </span>
                    </div>
                    <div className="annotation-item-meta">
                      {petName && <span className="annotation-item-pet">{petName}</span>}
                      {d.elimination_type && (
                        <span className={`annotation-elim-badge elim-${d.elimination_type}`}>
                          {t(`overview.${d.elimination_type}`)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {filteredEvents.length === 0 && (
                <li className="annotation-list-empty">{t('annotation.no_events')}</li>
              )}
            </>
          )}
        </ul>

        {totalPages > 1 && (
          <div className="annotation-list-pagination">
            <button
              className="annotation-page-btn"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              ‹
            </button>
            <span>{t('annotation.page_of', { current: currentPage, total: totalPages })}</span>
            <button
              className="annotation-page-btn"
              disabled={!eventsPage?.hasMore}
              onClick={() => goToPage(page + 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="annotation-tab-workspace">
        {selectedEvent ? (
          <AnnotationWorkspace
            key={selectedEvent.id}
            event={selectedEvent}
            videoOpen={videoOpen}
            onVideoOpenChange={setVideoOpen}
            actionsRef={workspaceActionsRef}
            onConvertedToMaintenance={handleAfterConvertToMaintenance}
          />
        ) : workspaceAwaitingSelection ? (
          <div className="annotation-tab-empty">
            <p>{t('devices.loading_events')}</p>
          </div>
        ) : (
          <div className="annotation-tab-empty">
            <p>{t('annotation.select_event')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnotationTab;
