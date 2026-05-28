// DePaul Library — MCP Server (stdio).
// Exposes tools, resources, and a UI resource that demonstrates the MCP Apps pattern.
//
// Run with:   node mcp-server.js
// Inspect:    npm run inspect

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  books,
  featuredShelf,
  policies,
  searchBooks,
  getBook,
  getStudent,
  listOverdue,
  checkOutBook,
} from './data/library.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: 'depaul-library', version: '0.1.0' },
  {
    instructions:
      'Fictional DePaul library catalog for CSC 394 demos. Use the tools to search books, check ' +
      'out a copy on behalf of a student, view a student account, or list overdue items. ' +
      'Resources expose featured-shelf, policies, and a UI dashboard for student accounts.',
  }
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.registerTool(
  'search_books',
  {
    title: 'Search books',
    description:
      'Search the DePaul library catalog by title, author, subject, or summary keyword. ' +
      'Returns up to `limit` matches ordered by relevance. Use this before check_out_book.',
    inputSchema: {
      query: z.string().describe('Free-text search across title, author, subject, and summary.'),
      limit: z.number().int().min(1).max(20).default(5)
        .describe('Maximum results to return. Default 5.'),
    },
  },
  async ({ query, limit }) => {
    const results = searchBooks(query, limit);
    return {
      structuredContent: { query, count: results.length, results },
      content: [
        {
          type: 'text',
          text:
            results.length === 0
              ? `No books found matching "${query}".`
              : results
                  .map(
                    (b, i) =>
                      `${i + 1}. ${b.title} — ${b.author} (${b.year})\n   ISBN ${b.isbn} · shelf ${b.shelf} · ${b.copies_available}/${b.copies_total} available\n   ${b.summary}`
                  )
                  .join('\n\n'),
        },
      ],
    };
  }
);

server.registerTool(
  'get_student_account',
  {
    title: 'Get student account (with UI dashboard)',
    description:
      'Look up a student\'s account: contact info, fines, currently checked-out books, and due ' +
      'dates. Returns structured data the model can reason over PLUS a reference to a UI ' +
      'dashboard component (an MCP App) for hosts that render inline UI.',
    inputSchema: {
      student_id: z.string().regex(/^S-\d{4}$/).describe('Student ID like S-1001.'),
    },
  },
  async ({ student_id }) => {
    const student = getStudent(student_id);
    if (!student) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No student with id ${student_id}.` }],
      };
    }
    const checked_out = student.checked_out.map((co) => {
      const book = getBook(co.isbn);
      return {
        isbn: co.isbn,
        title: book?.title ?? '(unknown)',
        author: book?.author ?? '',
        due_on: co.due_on,
        overdue: co.due_on < new Date().toISOString().slice(0, 10),
      };
    });

    const structured = {
      student_id: student.student_id,
      name: student.name,
      program: student.program,
      year: student.year,
      email: student.email,
      fines_usd: (student.fines_cents / 100).toFixed(2),
      checked_out,
    };

    return {
      structuredContent: structured,
      // _meta is delivered to the host (and any rendering iframe), not shown to the model.
      // The "ui.resourceUri" key is the standard MCP Apps pointer; "openai/outputTemplate" is
      // the OpenAI-compatible alias kept for ChatGPT Apps SDK clients.
      _meta: {
        ui: { resourceUri: 'ui://component/student-dashboard.html' },
        'openai/outputTemplate': 'ui://component/student-dashboard.html',
      },
      content: [
        {
          type: 'text',
          text:
            `${student.name} (${student.student_id}) — ${student.program}, ${student.year}\n` +
            `Email: ${student.email}\nFines: $${structured.fines_usd}\n\nChecked out:\n` +
            checked_out
              .map(
                (co) =>
                  `  • ${co.title} (${co.isbn}) — due ${co.due_on}${co.overdue ? ' ⚠ OVERDUE' : ''}`
              )
              .join('\n'),
        },
      ],
    };
  }
);

server.registerTool(
  'list_overdue',
  {
    title: 'List overdue items',
    description: 'List every overdue book across all students, with how many days overdue.',
    inputSchema: {},
  },
  async () => {
    const overdue = listOverdue();
    return {
      structuredContent: { count: overdue.length, items: overdue },
      content: [
        {
          type: 'text',
          text:
            overdue.length === 0
              ? 'No overdue items. 🎉'
              : overdue
                  .map(
                    (o) =>
                      `${o.student_name} (${o.student_id}) — "${o.title}" was due ${o.due_on} (${o.days_overdue} days overdue)`
                  )
                  .join('\n'),
        },
      ],
    };
  }
);

server.registerTool(
  'check_out_book',
  {
    title: 'Check out a book (destructive)',
    description:
      'Check out a copy of a book on a student\'s behalf. Fails if no copies are available, the ' +
      'student already has it, or either id is unknown. This MUTATES library state — hosts ' +
      'should prompt the user for confirmation before invoking.',
    inputSchema: {
      isbn: z.string().describe('ISBN of the book, exactly as listed in search_books.'),
      student_id: z.string().regex(/^S-\d{4}$/).describe('Student ID like S-1001.'),
    },
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ isbn, student_id }) => {
    try {
      const result = checkOutBook(isbn, student_id);
      return {
        structuredContent: result,
        content: [
          {
            type: 'text',
            text:
              `✅ Checked out "${result.title}" to ${result.student_name} (${result.student_id}).\n` +
              `Due: ${result.due_on}. Copies remaining: ${result.copies_remaining}.`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Check-out failed: ${err.message}` }],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Resources — static
// ---------------------------------------------------------------------------

server.registerResource(
  'featured-shelf',
  'library://catalog/featured',
  {
    title: 'Featured shelf',
    description: 'Curated picks the librarians want students to read this term.',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    const lines = ['# Featured Shelf', ''];
    for (const isbn of featuredShelf) {
      const b = getBook(isbn);
      if (!b) continue;
      lines.push(
        `- **${b.title}** — ${b.author} (${b.year})  \n  ${b.summary}  \n  Shelf ${b.shelf} · ISBN ${b.isbn}`
      );
    }
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: lines.join('\n'),
        },
      ],
    };
  }
);

server.registerResource(
  'policies',
  'library://policies',
  {
    title: 'Library policies',
    description: 'Loan periods, late fees, holds, lost-item rules.',
    mimeType: 'text/plain',
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/plain', text: policies }],
  })
);

server.registerResource(
  'catalog-index',
  'library://catalog/index',
  {
    title: 'Full catalog index',
    description: 'Every book in the catalog as JSON. Useful for letting the model browse.',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ books }, null, 2),
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// MCP App — UI component delivered as a resource.
// ChatGPT-style hosts will fetch this and render it in a sandboxed iframe when a
// tool result references it via _meta.ui.resourceUri. On hosts that do not render
// MCP Apps, the user still gets the plain text + structuredContent.
// ---------------------------------------------------------------------------

const dashboardHtml = readFileSync(join(__dirname, 'apps', 'student-dashboard.html'), 'utf8');

server.registerResource(
  'student-dashboard-ui',
  'ui://component/student-dashboard.html',
  {
    title: 'Student dashboard widget (MCP App)',
    description:
      'Interactive dashboard rendered by hosts that support MCP Apps. Reads structured ' +
      'output from get_student_account.',
    mimeType: 'text/html;profile=mcp-app',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/html;profile=mcp-app',
        text: dashboardHtml,
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: we deliberately don't console.log here — stdout is the JSON-RPC channel.
  // Use stderr if you need to debug.
  process.stderr.write('[depaul-library-mcp] ready on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[depaul-library-mcp] fatal: ${err?.stack || err}\n`);
  process.exit(1);
});
