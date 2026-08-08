// Embeds the built Fiori app as static content served by the App Router (section 5's
// architecture has no separate HTML5 Application Repository layer). Run ahead of the
// App Router module being packaged by mbt (see mta.yaml build-parameters.before-all).
import { cpSync } from 'node:fs';

cpSync('app/leave-request-manage/webapp', 'app/router/resources/leave-request-manage', { recursive: true });
