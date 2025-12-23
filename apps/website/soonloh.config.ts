import * as soonloh from 'soonloh';
import { snzrwm } from 'soonloh/builtin-parsers';
import { genLink } from 'soonloh/builtin-generators';
import { genSolidRouter } from './soonloh/solid-router.ts';

export default soonloh.config({
  routerRoot: 'src/app/',
  parser: snzrwm.parser({}),
  generators: [
    genLink({
      targetPath: () => 'src/shared/routes/link.ts',
      filter: (terminator) => /page|route|[A-Z]+/.test(terminator ?? ''),
    }),
    genSolidRouter({
      root: 'src/app/',
      targetPath: () => 'src/shared/routes/definition.ts',
    }),
  ],
});
