"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  /** Called after the user stops typing for `delay` ms (and immediately when cleared). */
  onSearch: (value: string) => void;
  defaultValue?: string;
  placeholder?: string;
  /** Accessible label; visually hidden. */
  label?: string;
  delay?: number;
  className?: string;
}

export function SearchInput({
  onSearch,
  defaultValue = "",
  placeholder = "Search…",
  label = "Search",
  delay = 300,
  className,
}: SearchInputProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const onSearchRef = useRef(onSearch);
  const firstRun = useRef(true);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => onSearchRef.current(value.trim()), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) setValue("");
        }}
        className="h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-8 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
