import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/avataaars';

const avatar = createAvatar(avataaars, { seed: 'Felix' });
console.log(typeof avatar.toDataUri);
console.log(typeof avatar.toDataUriSync);
