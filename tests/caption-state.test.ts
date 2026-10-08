import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptCaption,captionPageAt,visibleCaption,type CaptionSnapshot} from '../lib/caption-state';
import {publicSettings,defaults} from '../lib/settings';
const snap=(revision:number,text:string,published=1000,expires=20000,serverNow=1000):CaptionSnapshot=>({revision,text,published,expires,serverNow,settings:publicSettings(defaults)});
test('a late status poll never replaces a newer translated caption',()=>{const fresh=acceptCaption(null,snap(5,'new'),1000);assert.equal(acceptCaption(fresh,snap(4,'old'),1100).text,'new');assert.equal(acceptCaption(fresh,snap(6,''),1100).text,'');});
test('same revision is accepted so hide, clear and settings refreshes apply',()=>{const a=acceptCaption(null,snap(3,'grace'),1000);const b=acceptCaption(a,snap(3,'grace',1000,20000,1500),1500);assert.equal(b.revision,3);assert.equal(b.text,'grace');});
test('expiry follows the server clock even when the screen clock is skewed',()=>{const view=acceptCaption(null,snap(1,'peace',1000,5000,1000),61000);assert.equal(view.clockOffset,-60000);assert.equal(visibleCaption(view,61000+3000),'peace');assert.equal(visibleCaption(view,61000+4500),'');assert.equal(visibleCaption(null,0),'');});
test('every screen shows the same page for the same server time and pages clamp to the last one',()=>{assert.equal(captionPageAt(3,1000,1000),0);assert.equal(captionPageAt(3,1000,3999),0);assert.equal(captionPageAt(3,1000,4000),1);assert.equal(captionPageAt(3,1000,7100),2);assert.equal(captionPageAt(3,1000,99999),2);assert.equal(captionPageAt(3,5000,1000),0);assert.equal(captionPageAt(1,1000,99999),0);});
