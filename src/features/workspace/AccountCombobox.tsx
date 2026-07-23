// src/features/workspace/AccountCombobox.tsx
import { forwardRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { filterAccounts } from "./ledger-completions";

const MAX_ACCOUNT_SUGGESTIONS = 50;

type AccountComboboxProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  knownAccounts: string[];
  placeholder?: string;
};

/**
 * A ledger-account input with a filtered suggestion list. Replaces the native
 * <datalist>, whose popup the webview renders detached from the input. The list
 * is a normal in-document element anchored to the field wrapper, and it matches
 * accounts by substring and segment (via filterAccounts), so "Donations" surfaces
 * "Income:...:Donations".
 */
export const AccountCombobox = forwardRef<HTMLInputElement, AccountComboboxProps>(
  function AccountCombobox({ id, value, onChange, knownAccounts, placeholder }, ref) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const suggestions = filterAccounts(knownAccounts, value.trim()).slice(
      0,
      MAX_ACCOUNT_SUGGESTIONS,
    );
    // Nothing to disambiguate once the field already equals its only match — keep the
    // dropdown out of the way (and off any Approve button rendered below it).
    const exactlyMatched = suggestions.length === 1 && suggestions[0] === value.trim();
    const showSuggestions = open && suggestions.length > 0 && !exactlyMatched;

    function select(account: string) {
      onChange(account);
      setOpen(false);
      setActiveIndex(-1);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (!showSuggestions) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setOpen(true);
          setActiveIndex(-1);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
      } else if (event.key === "Enter" && activeIndex >= 0) {
        // Selecting a highlighted suggestion must not also submit the enclosing form.
        event.preventDefault();
        select(suggestions[activeIndex]);
      } else if (event.key === "Escape") {
        setOpen(false);
        setActiveIndex(-1);
      }
    }

    return (
      <div className="inbox-account-field">
        <input
          id={id}
          ref={ref}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(-1);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        {showSuggestions ? (
          <ul className="inbox-account-suggestions" id={`${id}-listbox`} role="listbox">
            {suggestions.map((account, index) => (
              <li
                key={account}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "inbox-account-option inbox-account-option--active"
                    : "inbox-account-option"
                }
                // onMouseDown fires before the input's blur, so the value is set before the list closes.
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(account);
                }}
              >
                {account}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
);
