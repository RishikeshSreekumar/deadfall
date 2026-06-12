import { IssuesIcon } from "@/components/IssuesIcon";
import { GhostIcon } from "@/components/GhostIcon";

// Plain config objects (not components) that embed JSX. The components inside
// are only "used" through these arrays.
export const navConfig = [
  {
    id: "issues",
    name: "Issues",
    path: "/issues",
    icon: <IssuesIcon className="text-icon-neutral" />,
    activeIcon: <IssuesIcon className="text-icon-brand" />,
  },
];

export const ghostConfig = [
  { id: "ghost", icon: <GhostIcon /> },
];
