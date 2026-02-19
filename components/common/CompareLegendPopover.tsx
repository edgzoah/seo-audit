"use client";

import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";

export function CompareLegendPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Delta legend
        </Button>
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
