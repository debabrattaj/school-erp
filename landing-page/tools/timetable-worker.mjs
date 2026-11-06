import {generateTimetable} from './engine.mjs?v=2';
self.onmessage=event=>{try{self.postMessage({result:generateTimetable(event.data)});}catch(error){self.postMessage({error:error.message});}};
