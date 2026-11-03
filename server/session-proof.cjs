'use strict';
const crypto=require('node:crypto');
function sessionClaims(token,userId){
 if(typeof token!=='string')return null;
 let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{return null;}
 if(claims.sub!==userId||typeof claims.session_id!=='string'||!claims.session_id)return null;
 return claims;
}
function createSessionProof(secret,token,userId){
 if(!secret)return null;const claims=sessionClaims(token,userId);if(!claims)return null;
 return crypto.createHmac('sha256',secret).update('longchamp-email-code-session-v1:'+userId+':'+claims.session_id).digest('base64url');
}
function validSessionProof(secret,token,userId,proof){
 const expected=createSessionProof(secret,token,userId);if(!expected||typeof proof!=='string'||proof.length!==expected.length)return false;
 return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(proof));
}
module.exports={createSessionProof,validSessionProof,sessionClaims};
