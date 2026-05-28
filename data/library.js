// Fake DePaul Library catalog. Pure data — no I/O.
// This is intentionally small and a little playful so demos are entertaining.

export const books = [
  {
    isbn: '978-0-13-468599-1',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    year: 2017,
    subjects: ['systems', 'databases', 'distributed'],
    copies_total: 4,
    copies_available: 1,
    shelf: 'CS-3F',
    summary:
      'The standard reference for thinking about storage, replication, and stream processing in real systems.',
  },
  {
    isbn: '978-0-321-12521-7',
    title: 'Domain-Driven Design',
    author: 'Eric Evans',
    year: 2003,
    subjects: ['software-engineering', 'architecture'],
    copies_total: 3,
    copies_available: 0,
    shelf: 'CS-3A',
    summary:
      'The book that gave us "bounded context" and "ubiquitous language" — heavy, but worth it.',
  },
  {
    isbn: '978-0-262-03384-8',
    title: 'Introduction to Algorithms (CLRS)',
    author: 'Cormen, Leiserson, Rivest, Stein',
    year: 2009,
    subjects: ['algorithms', 'cs-foundations'],
    copies_total: 6,
    copies_available: 3,
    shelf: 'CS-2D',
    summary: 'Still the textbook. Skim chapters 6, 22, and 23 before any interview.',
  },
  {
    isbn: '978-1-491-95035-7',
    title: 'Site Reliability Engineering',
    author: 'Beyer, Jones, Petoff, Murphy',
    year: 2016,
    subjects: ['operations', 'reliability', 'sre'],
    copies_total: 2,
    copies_available: 2,
    shelf: 'CS-4B',
    summary: 'Google\'s playbook for keeping production alive. Free online too, but the print is nicer.',
  },
  {
    isbn: '978-0-13-468599-2',
    title: 'Building LLM Powered Applications',
    author: 'Valentina Alto',
    year: 2024,
    subjects: ['llm', 'ai', 'applications'],
    copies_total: 3,
    copies_available: 1,
    shelf: 'CS-NEW',
    summary: 'A practical tour of the tooling layer above modern foundation models.',
  },
  {
    isbn: '978-0-262-04630-5',
    title: 'The Pragmatic Programmer (20th Anniversary)',
    author: 'Hunt, Thomas',
    year: 2019,
    subjects: ['software-engineering', 'craft'],
    copies_total: 5,
    copies_available: 4,
    shelf: 'CS-1A',
    summary: '"Don\'t live with broken windows." Re-read it every two years.',
  },
  {
    isbn: '978-1-718-50231-7',
    title: 'Crafting Interpreters',
    author: 'Robert Nystrom',
    year: 2021,
    subjects: ['languages', 'compilers'],
    copies_total: 2,
    copies_available: 1,
    shelf: 'CS-2A',
    summary: 'Build a language by hand in two passes. The most fun systems book of the decade.',
  },
  {
    isbn: '978-0-596-51774-8',
    title: 'JavaScript: The Good Parts',
    author: 'Douglas Crockford',
    year: 2008,
    subjects: ['javascript', 'languages'],
    copies_total: 1,
    copies_available: 1,
    shelf: 'CS-1C',
    summary: 'Old, opinionated, still strangely accurate. Mostly a reminder of what to avoid.',
  },
];

// Compute due dates relative to "today" so the demo always has a realistic
// mix of current and overdue items no matter when an instructor runs it.
const TODAY = new Date();
function daysFromNow(days) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const students = {
  'S-1001': {
    student_id: 'S-1001',
    name: 'Ana Pereira',
    program: 'B.S. Software Engineering',
    year: 'Junior',
    email: 'apereira@depaul.edu',
    fines_cents: 0,
    checked_out: [
      { isbn: '978-0-321-12521-7', due_on: daysFromNow(12) },
      { isbn: '978-0-262-03384-8', due_on: daysFromNow(19) },
    ],
  },
  'S-1002': {
    student_id: 'S-1002',
    name: 'Jamal Carter',
    program: 'B.S. Computer Science',
    year: 'Senior',
    email: 'jcarter4@depaul.edu',
    fines_cents: 425,
    checked_out: [
      { isbn: '978-1-491-95035-7', due_on: daysFromNow(-17) }, // overdue
      { isbn: '978-1-718-50231-7', due_on: daysFromNow(8) },
    ],
  },
  'S-1003': {
    student_id: 'S-1003',
    name: 'Priya Shah',
    program: 'M.S. Data Science',
    year: 'Graduate',
    email: 'pshah12@depaul.edu',
    fines_cents: 0,
    checked_out: [
      { isbn: '978-0-13-468599-2', due_on: daysFromNow(22) },
    ],
  },
};

export const featuredShelf = [
  '978-0-13-468599-2', // Building LLM Powered Applications
  '978-1-718-50231-7', // Crafting Interpreters
  '978-0-13-468599-1', // DDIA
];

export const policies = `DEPAUL LIBRARY — DEMO POLICIES (FICTITIOUS)

Loan period: 28 days for students, 90 days for faculty.
Renewals: up to 2 renewals if no holds.
Late fees: $0.25 per item per day, capped at the item's replacement cost.
Holds: place a hold if all copies are checked out; you are notified by email.
Lost items: report within 14 days to avoid replacement billing.

Questions? Ask at the CDM front desk or use the library MCP server :-).`;

export function searchBooks(query, limit = 5) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return books.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  const score = (b) => {
    const hay = {
      title: b.title.toLowerCase(),
      author: b.author.toLowerCase(),
      subjects: b.subjects.map((s) => s.toLowerCase()),
      summary: b.summary.toLowerCase(),
    };
    let s = 0;
    for (const t of tokens) {
      if (hay.title.includes(t)) s += 5;
      if (hay.author.includes(t)) s += 3;
      if (hay.subjects.some((sub) => sub.includes(t))) s += 2;
      if (hay.summary.includes(t)) s += 1;
    }
    return s;
  };
  return books
    .map((b) => ({ b, s: score(b) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.b);
}

export function getBook(isbn) {
  return books.find((b) => b.isbn === isbn) || null;
}

export function getStudent(studentId) {
  return students[studentId] || null;
}

export function listOverdue(today = new Date().toISOString().slice(0, 10)) {
  const overdue = [];
  for (const s of Object.values(students)) {
    for (const co of s.checked_out) {
      if (co.due_on < today) {
        const book = getBook(co.isbn);
        overdue.push({
          student_id: s.student_id,
          student_name: s.name,
          isbn: co.isbn,
          title: book?.title || '(unknown)',
          due_on: co.due_on,
          days_overdue: Math.max(
            0,
            Math.floor((Date.parse(today) - Date.parse(co.due_on)) / (1000 * 60 * 60 * 24))
          ),
        });
      }
    }
  }
  return overdue;
}

export function checkOutBook(isbn, studentId) {
  const book = getBook(isbn);
  if (!book) throw new Error(`Unknown ISBN: ${isbn}`);
  const student = getStudent(studentId);
  if (!student) throw new Error(`Unknown student: ${studentId}`);
  if (book.copies_available < 1) {
    throw new Error(`"${book.title}" has no copies available right now.`);
  }
  if (student.checked_out.some((co) => co.isbn === isbn)) {
    throw new Error(`Student ${studentId} already has "${book.title}" checked out.`);
  }
  // Mutate in-memory state. Fine for a demo.
  book.copies_available -= 1;
  const due = new Date();
  due.setDate(due.getDate() + 28);
  const due_on = due.toISOString().slice(0, 10);
  student.checked_out.push({ isbn, due_on });
  return {
    student_id: studentId,
    student_name: student.name,
    isbn,
    title: book.title,
    due_on,
    copies_remaining: book.copies_available,
  };
}

export function buildReadingList(topic, level = 'undergrad') {
  // For A2A demo — picks books matching topic + a level-aware ordering note.
  const matches = searchBooks(topic, 4);
  return {
    topic,
    level,
    note:
      level === 'graduate'
        ? 'Skim 1, read 2 closely, treat 3-4 as references.'
        : 'Read 1-2 cover to cover; sample 3 as needed.',
    items: matches.map((b, i) => ({
      order: i + 1,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      why: b.summary,
    })),
  };
}
