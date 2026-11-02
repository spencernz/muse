import { expect, it } from "vitest";
import { chooseCovers, rotateCover } from "./playlist-collage";
it("shows at most five unique covers and replaces only one with an unseen cover",()=>{
 const pool=["a","b","c","d","e","f","a",""];
 const shown=chooseCovers(pool,()=>.5);
 expect(shown).toHaveLength(5); expect(new Set(shown).size).toBe(5);
 const next=rotateCover(shown,pool,()=>.4);
 expect(new Set(next).size).toBe(5);
 expect(next.filter((path,i)=>path!==shown[i])).toHaveLength(1);
 expect(next.every(path=>pool.includes(path))).toBe(true);
});
it("does not rotate or duplicate when the playlist has five or fewer covers",()=>{
 for(const pool of [[],["a"],["a","a","b"],["a","b","c","d","e"]]) {
 const shown=chooseCovers(pool);expect(rotateCover(shown,pool)).toEqual(shown);
 expect(new Set(shown).size).toBe(shown.length);
 }
});
