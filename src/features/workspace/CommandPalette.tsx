import { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteMode = "commands" | "files" | "prompt";

export type CommandPaletteItem = {
  id: string;
  label: string;
  description?: string | null;
  group?: string | null;
  keywords?: string[];
  shortcut?: string | null;
  iconPath?: string | null;
  onSelect: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  mode: CommandPaletteMode;
  items: CommandPaletteItem[];
  promptLabel?: string | null;
  promptPlaceholder?: string | null;
  onClose: () => void;
  onPromptSubmit: (value: string) => void;
};

export function CommandPalette({
  open,
  mode,
  items,
  promptLabel,
  promptPlaceholder,
  onClose,
  onPromptSubmit,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [mode, open]);

  const filteredItems = useMemo(() => {
    if (mode === "prompt") return [];
    if (!query.trim()) return items;
    return items.filter((item) => matchesQuery(item, query));
  }, [items, mode, query]);

  useEffect(() => {
    if (mode === "prompt") return;
    if (filteredItems.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((current) => Math.min(current, filteredItems.length - 1));
  }, [filteredItems, mode]);

  if (!open) return null;

  function executeSelected() {
    if (mode === "prompt") {
      const value = query.trim();
      if (value) {
        onPromptSubmit(value);
      }
      return;
    }

    const item = filteredItems[selectedIndex];
    if (item) {
      item.onSelect();
    }
  }

  return (
    <div className="command-palette-overlay" role="presentation" onClick={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="command-palette-search">
          <SearchIcon />
          <input
            ref={inputRef}
            aria-label={mode === "prompt" ? promptLabel ?? "Command input" : "Search commands"}
            className="command-palette-input"
            placeholder={promptPlaceholder ?? "Search commands"}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }
              if (mode !== "prompt") {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedIndex((current) =>
                    filteredItems.length === 0 ? 0 : (current + 1) % filteredItems.length,
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedIndex((current) =>
                    filteredItems.length === 0
                      ? 0
                      : (current - 1 + filteredItems.length) % filteredItems.length,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  executeSelected();
                }
              } else if (event.key === "Enter") {
                event.preventDefault();
                executeSelected();
              }
            }}
          />
          <span className="command-palette-badge">{mode === "prompt" ? "Enter" : "⌘K"}</span>
        </div>

        {mode === "prompt" ? (
          <div className="command-palette-prompt">
            <div className="command-palette-prompt-title">{promptLabel ?? "Command"}</div>
            <div className="command-palette-prompt-copy">
              Type the value for this command, then press Enter.
            </div>
          </div>
        ) : (
          <div className="command-palette-list" role="listbox" aria-label="Command results">
            {filteredItems.length > 0 ? (
              filteredItems.map((item, index) => {
                const active = index === selectedIndex;
                const showGroup =
                  query.trim().length === 0 && item.group && (index === 0 || filteredItems[index - 1]?.group !== item.group);
                return (
                  <div key={item.id}>
                    {showGroup ? <div className="command-palette-group">{item.group}</div> : null}
                    <button
                      className={`command-palette-item ${active ? "active" : ""}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => item.onSelect()}
                    >
                      <span className="command-palette-icon" aria-hidden="true">
                        {item.iconPath ? <Icon path={item.iconPath} /> : null}
                      </span>
                      <span className="command-palette-label">
                        {item.label}
                        {item.description ? (
                          <span className="command-palette-description">{item.description}</span>
                        ) : null}
                      </span>
                      {item.shortcut ? (
                        <span className="command-palette-shortcut">{item.shortcut}</span>
                      ) : null}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="command-palette-empty">No commands match.</div>
            )}
          </div>
        )}

        <div className="command-palette-footer">
          <span className="footer-item">
            <span className="key">↑</span>
            <span className="key">↓</span> to navigate
          </span>
          <span className="footer-item">
            <span className="key">↵</span> to select
          </span>
          <span className="spacer" />
          <span className="footer-item">
            <span className="key">esc</span> to close
          </span>
        </div>
      </section>
    </div>
  );
}

function matchesQuery(item: CommandPaletteItem, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = [item.label, item.description ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  return tokens.every((token) => haystack.includes(token));
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="command-palette-search-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
      <path
        d={path}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
