const assert=require('node:assert/strict');
const core=require('../follow-core.js');
assert.equal(core.validCAS('307-24-4'),true);
assert.equal(core.validCAS('307-24-5'),false);
assert.equal(core.validCAS('PFHxA'),false);
const follow={id:'f1',kind:'substance',value:'307-24-4',markets:['EU','US-CA'],products:['pliage'],includeRelated:true,paused:false};
const links=[{key:'eu-exact',kind:'substance',value:'307-24-4',relation:'direct',markets:['EU'],products:['pliage','textile']},{key:'ca-exact',kind:'substance',value:'307-24-4',relation:'direct',markets:['US-CA'],products:['pliage']},{key:'other-chemical',kind:'substance',value:'375-22-4',relation:'direct',markets:['US-CA'],products:['pliage']},{key:'same-cas-other-market',kind:'substance',value:'307-24-4',relation:'direct',markets:['JP'],products:['pliage']},{key:'same-cas-other-product',kind:'substance',value:'307-24-4',relation:'direct',markets:['EU'],products:['souliers']},{key:'broader-pfas',kind:'substance',value:'307-24-4',relation:'related_scope',markets:['EU'],products:['pliage']}];
assert.deepEqual(core.linksFor(follow,links).map(x=>x.key),['eu-exact','ca-exact','broader-pfas']);
assert.deepEqual(core.linksFor({...follow,includeRelated:false},links).map(x=>x.key),['eu-exact','ca-exact']);
assert.deepEqual(core.linksFor({...follow,paused:true},links),[]);
assert.deepEqual(core.linksFor({...follow,value:'50-00-0'},links),[]);
assert.equal(core.cleanFollow({kind:'substance',value:'307-24-5',markets:['EU'],products:['pliage']}),null);
assert.equal(core.cleanFollow({...follow,markets:['<script>']}),null);
const raw=core.cleanFollow(follow);assert.equal(raw.value,'307-24-4');
assert.equal(core.cleanFollow({...follow,products:[]}),null);
console.log('PASS CAS checksum, exact identity, market/product isolation, related scope opt-in, pause, unknown CAS and persisted input validation');
assert.equal(core.cleanFollow({...follow,id:"x');alert(1)//"}),null);

assert.equal(core.cleanFollow({...follow,kind:'family',value:'not-PFAS'}),null);

assert(core.cleanFollow({...follow,kind:'text',value:'fr-rc-merta-express-sensualité-captive-lilial-20260901'}));
