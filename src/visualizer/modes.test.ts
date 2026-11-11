import {expect,it,vi} from 'vitest';
import {effects} from './types';
import {validatePreferences,shuffledEffect} from './preferences';
it('removes Petals and migrates old saved choices without losing other preferences',()=>{expect(effects).toEqual(['spectrum','wave','retro','fire']);for(const old of ['petals','nebula'])expect(validatePreferences({effect:old,theme:'ice',intensity:1.4,auto:true})).toEqual({effect:'spectrum',theme:'ice',intensity:1.4,auto:true});const random=vi.spyOn(Math,'random');for(const current of effects)for(const value of [0,.3,.6,.999]){random.mockReturnValue(value);expect(shuffledEffect(current)).not.toBe(current);expect(effects).toContain(shuffledEffect(current));}random.mockRestore();});
it('migrates a saved Chalk Zoo choice to Wave',()=>{expect(validatePreferences({effect:'chalk',theme:'ember',intensity:.8,auto:false})).toEqual({effect:'wave',theme:'ember',intensity:.8,auto:false});});
