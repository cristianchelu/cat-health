import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import {
  createEan13Detector,
  matchFoodByBarcode,
  type Ean13Detector,
} from '@/lib/barcodeScan';
import './FoodScanStep.css';

interface FoodScanStepProps {
  foods: readonly GetFoodDTO[];
  onMatch: (food: GetFoodDTO) => void;
  /** Seams for tests; production defaults hit the real APIs. */
  createDetector?: () => Ean13Detector;
  requestCamera?: () => Promise<MediaStream>;
}

type ScanState =
  | { status: 'scanning' }
  | { status: 'denied' }
  | { status: 'no-match' };

/** How often to ask the detector — often enough to feel instant, rarely
    enough that a phone does not cook itself holding a pouch steady. */
const DETECT_INTERVAL_MS = 200;

/** The camera you point at something, not the one pointed at you. */
const requestRearCamera = (): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });

/**
 * Point the camera at the pack and land on the amount step. Zero reading,
 * and fewer taps than the ladder — but only where the browser can do it, so
 * the ladder remains the way in that always works.
 */
const FoodScanStep: React.FC<FoodScanStepProps> = ({
  foods,
  onMatch,
  createDetector = createEan13Detector,
  requestCamera = requestRearCamera,
}) => {
  const { t } = useTranslation();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [state, setState] = React.useState<ScanState>({ status: 'scanning' });
  /* The code just rejected, so a pack left in frame does not re-fire the
     same "no match" the moment it is dismissed. */
  const dismissedRef = React.useRef<string | null>(null);
  /* Everything the camera effect reads goes through a ref: it runs once per
     attempt, and a caller's inline callback must not restart the stream just
     by being a new function this render. */
  const foodsRef = React.useRef(foods);
  foodsRef.current = foods;
  const onMatchRef = React.useRef(onMatch);
  onMatchRef.current = onMatch;
  const createDetectorRef = React.useRef(createDetector);
  createDetectorRef.current = createDetector;
  const requestCameraRef = React.useRef(requestCamera);
  requestCameraRef.current = requestCamera;

  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    /* Captured once: cleanup must release the element this effect attached
       the stream to, not whatever the ref points at by then. */
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let busy = false;

    const stop = () => {
      if (interval) clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
    };

    const start = async () => {
      let detector: Ean13Detector;
      try {
        detector = createDetectorRef.current();
        stream = await requestCameraRef.current();
      } catch {
        if (!cancelled) setState({ status: 'denied' });
        return;
      }
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      interval = setInterval(async () => {
        if (busy || cancelled || !video || video.readyState < 2) return;
        busy = true;
        try {
          const [first] = await detector.detect(video);
          if (!first || cancelled) return;
          const code = first.rawValue;
          if (code === dismissedRef.current) return;

          const food = matchFoodByBarcode(foodsRef.current, code);
          if (!food) {
            dismissedRef.current = code;
            setState({ status: 'no-match' });
            return;
          }
          /* Nothing left to confirm: the pack in frame is the answer, so
             release the camera and let the amount step take the screen. */
          stop();
          onMatchRef.current(food);
        } catch {
          /* A frame that will not decode is the normal case, not an error. */
        } finally {
          busy = false;
        }
      }, DETECT_INTERVAL_MS);
    };

    void start();

    return () => {
      cancelled = true;
      stop();
      if (video) video.srcObject = null;
    };
  }, [attempt]);

  const rescan = () => {
    setState({ status: 'scanning' });
    setAttempt((n) => n + 1);
  };

  if (state.status === 'denied') {
    return <p className="food-scan-step denied">{t('log_food.scan_denied')}</p>;
  }

  return (
    <div className="food-scan-step">
      <div className="food-scan-viewport">
        <video ref={videoRef} muted playsInline className="food-scan-video" />
        <div className="food-scan-frame" aria-hidden="true">
          <span className="food-scan-line" />
        </div>
        <p className="food-scan-hint">{t('log_food.scan_hint')}</p>
      </div>

      {state.status === 'no-match' && (
        <div className="food-scan-result">
          <span className="food-scan-result-text">
            {t('log_food.scan_no_match')}
          </span>
          <Button variant="secondary" size="sm" onClick={rescan}>
            {t('log_food.scan_rescan')}
          </Button>
        </div>
      )}
    </div>
  );
};

export { FoodScanStep, type FoodScanStepProps };
