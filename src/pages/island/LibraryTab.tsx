import { useState } from "react";
import { AppWindow, Files } from "lucide-react";
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
  const [selected, setSelected] = useState<"apps" | "files">("apps");
  const active = selected === "apps" ? (launcherOn ? "apps" : "files") : (shelfOn ? "files" : "apps");
  return <section className="library-page" data-testid="library-page" dir={i("rtl", "ltr")}>
    <header className="library-heading">
      <h2>{i("المكتبة", "Library")}</h2>
      <div className="library-categories" role="group" aria-label={i("محتوى المكتبة", "Library contents")}>
        {launcherOn && <button type="button" data-testid="library-select-apps" aria-pressed={active === "apps"} onClick={() => setSelected("apps")}><AppWindow size={13} />{i("التطبيقات والاختصارات", "Apps and shortcuts")}</button>}
        {shelfOn && <button type="button" data-testid="library-select-files" aria-pressed={active === "files"} onClick={() => setSelected("files")}><Files size={13} />{i("الملفات المحفوظة", "Saved files")}<span>{items.length}</span></button>}
      </div>
    </header>
    <div className="library-content library-organized" data-wide={wide ? "true" : "false"} data-parts={Number(shelfOn) + Number(launcherOn)}>
      {shelfOn && <section hidden={active !== "files"} className="library-part" data-testid="library-files" aria-label={i("الملفات والنصوص", "Files and text")}>
        <div className="library-part-body"><ShelfTab compact items={items} dragging={dragging} reload={reload} /></div>
      </section>}
      {launcherOn && <section hidden={active !== "apps"} className="library-part" data-testid="library-apps" aria-label={i("التطبيقات المحفوظة", "Saved applications")}>
        <div className="library-part-body"><LauncherTab compact launcher={launcher} /></div>
      </section>}
    </div>
  </section>;
}
