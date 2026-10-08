import type {Settings} from './settings';
export type CaptionStyle=Pick<Settings,'fontSize'|'color'|'background'|'transparent'|'position'|'margin'|'lines'|'clearSeconds'>;
export type CaptionSnapshot={revision:number;text:string;published:number;expires:number;serverNow:number;settings:CaptionStyle};
export type CaptionView={revision:number;text:string;published:number;expires:number;clockOffset:number;settings:CaptionStyle};
/** A late status request must never overwrite a caption delivered by translate. */
export function acceptCaption(current:CaptionView|null,next:CaptionSnapshot,receivedAt:number):CaptionView {
 if(current&&next.revision<current.revision)return current;
 return {revision:next.revision,text:next.text,published:next.published,expires:next.expires,settings:next.settings,clockOffset:next.serverNow-receivedAt};
}
export function visibleCaption(view:CaptionView|null,now:number){return view&&view.expires>now+view.clockOffset?view.text:'';}
export function captionPageAt(count:number,published:number,now:number){return Math.max(0,Math.min(count-1,Math.floor((now-published)/3000)));}
