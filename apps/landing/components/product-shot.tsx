import type { Capture } from "@/lib/captures";
import { ThemeImage } from "./shot";

export interface ProductShotProps {
  /** Screenshot of the panel, served from `public/`: `src` in the light theme, `srcDark` in the dark one. */
  src: string;
  srcDark?: string;
  alt: string;
  /** Intrinsic pixel size of the screenshot (both themes have the same). */
  width: number;
  height: number;
  /**
   * Share of the screenshot's width taken by the panel's sidebar. That strip is cut out and set
   * back in depth, which is what makes a flat screenshot read as layered UI.
   */
  sidebarRatio?: number;
}

/**
 * One panel screenshot shown in 3D under the hero: tilted in perspective, the sidebar a step
 * behind the main area, a rim or soft shadow and a blue glow, and the edges fading into the page.
 * The panel shows in the page's theme.
 *
 * Both layers are the same image inside an `overflow: hidden` box, shifted so each box shows
 * its own strip. Boxes (rather than clip-path) keep the rounded corners and shadows intact.
 */
export function ProductShot({ src, srcDark, alt, width, height, sidebarRatio = 0.16 }: ProductShotProps) {
  const mainRatio = 1 - sidebarRatio;
  const capture: Capture = { src, srcDark, alt, width, height };
  // The image is served as is (`unoptimized`): the capture is a ~130 KB webp already, and the
  // optimizer's default quality would soften the small panel text that the tilt makes smaller still.
  // It is first paint, so both themes load eagerly; the layers share the file, so it loads once.
  return (
    // The outer box carries the fade mask and is larger than the shot, so the sidebar layer can step
    // out to the left and the glow can rise above the top without being cut off at the mask's edge.
    // The negative bottom margin takes back the faded-out strip, so no empty band follows the shot.
    <div className="product-shot pointer-events-none -mt-[10%] -mb-[18%] -ml-[2%] w-[190%] max-w-none px-[3%] pt-[10%] select-none sm:mx-auto sm:-mt-[6%] sm:-mb-[11%] sm:w-full sm:max-w-[1320px] sm:px-[5%] sm:pt-[6%]">
      <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
        <div aria-hidden className="product-shot-glow absolute inset-[-7%_-4%_6%]" />
        <div className="product-shot-stage absolute inset-0">
          <div className="product-shot-tilt relative h-full w-full">
            <div
              className="product-shot-layer product-shot-sidebar absolute inset-y-0 left-0 overflow-hidden rounded-[14px]"
              style={{ width: `${sidebarRatio * 100}%` }}
            >
              <ThemeImage
                capture={capture}
                alt=""
                eager
                className="h-full max-w-none object-cover object-left"
                style={{ width: `${100 / sidebarRatio}%` }}
              />
            </div>
            <div
              className="product-shot-layer product-shot-main absolute inset-y-0 right-0 overflow-hidden rounded-[14px]"
              style={{ width: `${mainRatio * 100}%` }}
            >
              <ThemeImage
                capture={capture}
                eager
                className="h-full max-w-none object-cover object-left"
                style={{ width: `${100 / mainRatio}%`, marginLeft: `-${(sidebarRatio / mainRatio) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
