import { expect, it } from "vitest";
import { parseLrc } from "./lyrics";
it("handles repeated timestamps, offsets, blanks and metadata without inventing timing",()=>{
  const lines=parseLrc("[ar:Synthetic artist]\n[offset:-1000]\n[00:12.50][00:22.50]Synthetic line\n[00:30.00]\n[00:99]Invalid\nPlain text");
  expect(lines).toEqual([{time:11.5,text:"Synthetic line"},{time:21.5,text:"Synthetic line"},{time:29,text:""}]);
  expect(parseLrc("Only plain words")).toEqual([]);
});
