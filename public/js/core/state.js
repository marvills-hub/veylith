const state={
 dashboard:null,
 connected:false,
 lastEventAt:null,
 selectedTaskId:null
};
const listeners=new Set();
export function getState(){return state}
export function setState(patch){
 Object.assign(state,patch);
 listeners.forEach(listener=>listener(state));
}
export function subscribe(listener){
 listeners.add(listener);
 return()=>listeners.delete(listener);
}
