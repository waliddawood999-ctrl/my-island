import { i } from "../../i18n";
import type { useLauncher } from "../../useLauncher";
import type { ShelfItem } from "../../useShelf";
import { LauncherTab } from "./LauncherTab";
import { ShelfTab } from "./ShelfTab";

/** One destination, with both existing feature sets mounted together; no second page or tab. */
export function LibraryTab({ launcher, items, dragging, reload, shelfOn, launcherOn, wide }: {
  launcher: ReturnType<typeof useLauncher>; items: ShelfItem[]; dragging: boolean;
  reload: () => void; shelfOn: boolean; launcherOn: boolean; wide: boolean;
}) {
  return <section className="library-page" data-testid="library-page" dir={i("rtl", "ltr")}>
    <h2>{i("المكتبة", "Library")}</h2>
    <div className="library-content" data-wide={wide ? "true" : "false"} data-parts={Number(shelfOn) + Number(launcherOn)}>
      {shelfOn && <section className="library-part" data-testid="library-files" aria-label={i("الملفات والنصوص", "Files and text")}>
        <h3>{i("الملفات والنصوص", "Files and text")}</h3>
        <div className="library-part-body"><ShelfTab items={items} dragging={dragging} reload={reload} /></div>
      </section>}
      {launcherOn && <section className="library-part" data-testid="library-apps" aria-label={i("التطبيقات المحفوظة", "Saved applications")}>
        <h3>{i("التطبيقات المحفوظة", "Saved applications")}</h3>
        <div className="library-part-body"><LauncherTab launcher={launcher} /></div>
      </section>}
    </div>
  </section>;
}
