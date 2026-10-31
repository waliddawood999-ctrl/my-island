import { createRoot } from "react-dom/client";
import "../../index.css";
import { i } from "../../i18n";

function App() {
  return (
    <div dir="auto" className="p-4 text-lg font-bold text-[#8ea2ff]">
      {i("الجزيرة", "Island")}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
