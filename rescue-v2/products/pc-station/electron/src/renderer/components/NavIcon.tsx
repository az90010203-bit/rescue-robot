type IconName =
  | "arm"
  | "camera"
  | "devices"
  | "drive"
  | "legs"
  | "settings";

interface NavIconProps {
  readonly name: IconName;
}

const paths: Readonly<Record<IconName, readonly string[]>> = {
  drive: [
    "M5 7h14l2 4v6h-2",
    "M5 17H3v-6l2-4Z",
    "M7 17h10",
    "M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    "M8 7l2-3h4l2 3"
  ],
  arm: [
    "M5 20h8",
    "M7 20v-5l5-3",
    "M12 12l3-6",
    "M15 6l4 2",
    "M17 8l-2 4",
    "M4 15h6"
  ],
  legs: [
    "M8 4h8v6H8z",
    "M8 8 4 13v7",
    "M16 8l4 5v7",
    "M10 10 8 16v4",
    "M14 10l2 6v4"
  ],
  camera: [
    "M4 7h11a2 2 0 0 1 2 2v8H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
    "m17 11 5-3v8l-5-3",
    "M7 7l1-3h5l1 3"
  ],
  devices: [
    "M4 4h7v7H4z",
    "M13 4h7v7h-7z",
    "M4 13h7v7H4z",
    "M13 13h7v7h-7z"
  ],
  settings: [
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.4 1.13l-.03.09H9.53l-.03-.09A1.7 1.7 0 0 0 8.1 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1.13-1.4l-.09-.03V9.53l.09-.03A1.7 1.7 0 0 0 3.6 8.1a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.3l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1.4-1.13l.03-.09h4.04l.03.09A1.7 1.7 0 0 0 14.9 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 1.13 1.4l.09.03v4.04l-.09.03A1.7 1.7 0 0 0 19.4 15Z"
  ]
};

/** Compact line icon used only for primary navigation. */
export function NavIcon({ name }: NavIconProps): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 24 24">
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
