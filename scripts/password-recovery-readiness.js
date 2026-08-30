import { getPasswordRecoveryReadiness } from '../src/passwordRecoveryReadiness.js';

const readiness = getPasswordRecoveryReadiness(process.env);
console.log(JSON.stringify(readiness, null, 2));
if (!readiness.configured) process.exitCode = 2;
