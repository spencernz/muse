import {act,cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MusicAnalysisSection} from './music-analysis';
import {musicAnalysis,type AnalysisStatus} from '../music-analysis';
import {useMuse} from '../store';
vi.mock('../music-analysis',()=>({musicAnalysis:{status:vi.fn(),review:vi.fn(),start:vi.fn(),cancel:vi.fn(),background:vi.fn(),correct:vi.fn()}}));
const status:AnalysisStatus={supported:true,installed:true,running:false,enabled:false,total:30,analysed:0,completed:0,skipped:0,failed:0,message:'Ready',error:null};
beforeEach(()=>{vi.resetAllMocks();act(()=>useMuse.setState({context:'analysis'}));vi.mocked(musicAnalysis.status).mockResolvedValue(status);vi.mocked(musicAnalysis.review).mockResolvedValue([]);});afterEach(cleanup);
it('starts a pilot with progress and supports cancelling without cloud credentials',async()=>{
 vi.mocked(musicAnalysis.start).mockResolvedValue({...status,running:true,message:'Analysing samples…'});vi.mocked(musicAnalysis.cancel).mockResolvedValue();const user=userEvent.setup();render(<MusicAnalysisSection/>);await user.click(await screen.findByRole('button',{name:'Analyse 20 tracks'}));expect(musicAnalysis.start).toHaveBeenCalledWith('pilot');expect(screen.getByRole('progressbar')).toBeVisible();await user.click(screen.getByRole('button',{name:'Cancel analysis'}));expect(musicAnalysis.cancel).toHaveBeenCalledTimes(1);
});
it('shows installation failure and allows retry',async()=>{
 vi.mocked(musicAnalysis.status).mockResolvedValue({...status,installed:false});vi.mocked(musicAnalysis.start).mockRejectedValueOnce('Download interrupted. Retry installation.');const user=userEvent.setup();render(<MusicAnalysisSection/>);const install=await screen.findByRole('button',{name:'Install local analyser'});await user.click(install);expect(await screen.findByRole('alert')).toHaveTextContent('Download interrupted');expect(install).toBeEnabled();expect(screen.getByRole('button',{name:'Analyse 20 tracks'})).toBeDisabled();
});
it('saves a per-mood correction separately from model estimates',async()=>{
 vi.mocked(musicAnalysis.status).mockResolvedValue({...status,analysed:1});vi.mocked(musicAnalysis.correct).mockResolvedValue();vi.mocked(musicAnalysis.review).mockResolvedValue([{id:'track',title:'Sample',artist:'Artist',profile:{relaxed:.9,happy:.4,sad:.2,aggressive:.1,danceable:.2,instrumental:.8,energy:.2,confidence:.8,tempo:80,sampleSeconds:45,modelVersion:'musicnn-profiles-1'},overrides:{}}]);const user=userEvent.setup();render(<MusicAnalysisSection/>);await user.click(await screen.findByRole('button',{name:'Exclude Sample Chill match'}));expect(musicAnalysis.correct).toHaveBeenCalledWith('track','Chill',false);
});
