import { or } from '@optique/core';
import { run } from '@optique/run';
import { CommandComicWorld } from './app/commands/comic-world.ts';

const commands = or(CommandComicWorld);

const execute = run(CommandComicWorld);
await execute();
