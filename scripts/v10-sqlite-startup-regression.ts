import{db}from"../src/database/database.js";

let failures=0;

function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

const journal=db.prepare("PRAGMA journal_mode").get() as any;
const timeout=db.prepare("PRAGMA busy_timeout").get() as any;
const foreignKeys=db.prepare("PRAGMA foreign_keys").get() as any;

const journalValue=String(
 journal?.journal_mode??Object.values(journal??{})[0]??""
).toLowerCase();

const timeoutValue=Number(
 timeout?.timeout??Object.values(timeout??{})[0]??0
);

const foreignValue=Number(
 foreignKeys?.foreign_keys??Object.values(foreignKeys??{})[0]??0
);

check("database uses WAL",journalValue==="wal");
check("busy timeout is at least 5000ms",timeoutValue>=5000);
check("foreign keys remain enabled",foreignValue===1);

console.log(`SQLITE CONFIG REGRESSION: ${3-failures}/3`);
process.exitCode=failures?1:0;
