import { createRoot } from "react-dom/client";
import "../../index.css";
import "./island.css";
import { Pill } from "./Pill";
import { debugFreeze, usePagePulse } from "../../usePagePulse";

function Root() {
  usePagePulse();
  return (
    <>
      <Pill />
      {import.meta.env.DEV && (
        <button
          onClick={debugFreeze}
          className="fixed bottom-0 left-0 rounded bg-red-700 px-1 text-[10px] text-white opacity-60 hover:opacity-100"
        >
          debug_freeze
        </button>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
