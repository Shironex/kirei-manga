/**
 * The 3D island's entry. The page imports it on demand (desktop class
 * devices with a real GPU, after first paint), so phones never download it.
 */
import { createRoot } from 'react-dom/client';
import { Scene, type SceneOptions } from './Scene';

export function mountScene(container: HTMLElement, options: SceneOptions): () => void {
  const root = createRoot(container);
  root.render(<Scene {...options} />);
  return () => root.unmount();
}
