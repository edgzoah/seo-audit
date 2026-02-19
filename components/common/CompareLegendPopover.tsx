"use client";

import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function CompareLegendPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="page-btn">
          Delta legend
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p>
          Positive delta means category score improved in current run.
          <br />
          Negative delta means regression.
        </p>
      </PopoverContent>
    </Popover>
  );
}
