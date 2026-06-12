import { navConfig } from "@/nav/config";

// References navConfig as a value, then renders the JSX stored in each entry.
export function Sidebar() {
  return (
    <nav>
      {navConfig.map((item) => (
        <span key={item.id}>
          {item.icon}
          {item.activeIcon}
        </span>
      ))}
    </nav>
  );
}
