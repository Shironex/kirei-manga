/**
 * The tour's page side: reads the scroll as the stop sections pass over the
 * pinned stage, keeps the stop rail, the posters and the page colours in step
 * with it, and starts the 3D island on desktop class devices once the page
 * has loaded. No three.js here; the island comes in through a dynamic import.
 */
import { coverById } from '../lib/covers';
import { setSeed } from '../lib/seed';
import { gateScene, hasRealGpu } from './gate';
import { nearestStop, smoothstep } from './progress';
import { trackTour } from './scroll';
import { LAST_STOP, STOPS } from './stops';

/** From this width the stops take turns over the stage; below it the page is the phone layout. */
const TOURING_QUERY = '(min-width: 900px)';

export function startTour(tour: HTMLElement): void {
  const sections = [...tour.querySelectorAll<HTMLElement>('[data-stop-section]')];
  const tracker = trackTour(tour, sections, matchMedia(TOURING_QUERY));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const panels = sections.map(s => s.querySelector<HTMLElement>('[data-panel]'));
  const fill = tour.querySelector<HTMLElement>('[data-fill]');
  const counter = tour.querySelector<HTMLElement>('[data-counter]');
  const buttons = [...tour.querySelectorAll<HTMLButtonElement>('[data-goto]')];
  const posters = [...tour.querySelectorAll<HTMLImageElement>('[data-poster]')];
  let current = -1;
  let live = false;

  const loadPoster = (index: number) => {
    const img = posters[index];
    if (img?.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
  };
  const showPoster = (index: number) => {
    if (live) return;
    loadPoster(index);
    for (const img of posters)
      img.classList.toggle('is-shown', Number(img.dataset.poster) === index);
  };

  const setStop = (index: number) => {
    if (index === current) return;
    current = index;
    if (counter) {
      counter.textContent = index === 0 ? `${LAST_STOP} stops` : `${index} of ${LAST_STOP}`;
    }
    for (const button of buttons) {
      const at = Number(button.dataset.goto);
      button.dataset.state = at < index ? 'passed' : at === index ? 'current' : 'ahead';
      if (at === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    const stop = STOPS[index];
    if (stop) {
      const cover = coverById(stop.cover);
      setSeed(cover.hue, cover.chroma);
    }
    showPoster(index);
  };

  const render = (progress: number) => {
    setStop(nearestStop(progress));
    fill?.style.setProperty('--fill', (progress / LAST_STOP).toFixed(4));
    // The copy scrolls with the page and only dims near the window's edges.
    panels.forEach((panel, i) => {
      if (panel)
        panel.style.opacity = (1 - smoothstep(Math.abs(progress - i), 0.32, 0.5)).toFixed(3);
    });
    if (!live && progress > 0) loadPoster(Math.ceil(progress));
  };

  let queued = false;
  tracker.subscribe(progress => {
    if (current < 0) return render(progress);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      render(tracker.read());
    });
  });
  for (const button of buttons) {
    button.addEventListener('click', () =>
      tracker.scrollToStop(Number(button.dataset.goto), !reduced)
    );
  }

  const params = new URLSearchParams(location.search);
  const capture = params.get('capture');
  if (capture) document.documentElement.classList.add('capture');
  const canvas = tour.querySelector<HTMLElement>('[data-canvas]');
  const gate = gateScene(params);
  tour.dataset.sceneReason = gate.reason;
  if (!canvas || !gate.live) return;

  let unmount: (() => void) | null = null;
  let stopped = false;
  const fail = (reason: string) => {
    stopped = true;
    live = false;
    tour.classList.remove('is-live');
    tour.dataset.sceneReason = reason;
    unmount?.();
    unmount = null;
    showPoster(current);
  };

  const start = () => {
    if (stopped) return;
    if (!hasRealGpu()) return fail('no-gpu');
    import('../scene/mount')
      .then(({ mountScene }) => {
        if (stopped) return;
        unmount = mountScene(canvas, {
          scroll: tracker,
          heroUrl: tour.dataset.sceneGlb || null,
          mascotUrl: tour.dataset.mascotGlb || null,
          capture: capture === 'mobile' ? 'mobile' : capture ? 'stops' : null,
          onReady: () => {
            live = true;
            tour.classList.add('is-live');
            tour.dataset.sceneReason = 'live';
          },
          onFail: fail,
        });
      })
      .catch(() => fail('chunk-failed'));
  };

  // Turning on reduced motion mid-visit goes back to the posters for good.
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
    if (e.matches) fail('reduced-motion');
  });

  // The GPU probe waits for idle time too: making a context can wake the GPU
  // process, and the first paint does not need it.
  const idle = () =>
    'requestIdleCallback' in window
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : setTimeout(start, 200);
  if (capture || document.readyState === 'complete') {
    if (capture) start();
    else idle();
  } else {
    window.addEventListener('load', idle, { once: true });
  }
}
