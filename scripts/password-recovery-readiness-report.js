import { getPasswordRecoveryReadiness } from '../src/passwordRecoveryReadiness.js';

const readiness = getPasswordRecoveryReadiness(process.env);
console.log(`[password-recovery-readiness] ${JSON.stringify(readiness)}`);
