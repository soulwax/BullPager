import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createProjectFolder: vi.fn(),
  deleteProjectFile: vi.fn(),
  getBoardProject: vi.fn(),
  getProjectFile: vi.fn(),
  listProjectFiles: vi.fn(),
  listProjectFolders: vi.fn(),
  normalizeProjectPath: (value: string) => value.replaceAll('\\', '/'),
  normalizeProjectFilePath: (value: string) => value.replaceAll('\\', '/'),
  recordProjectActivity: vi.fn(),
  upsertProjectFile: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/projects/[slug]/files/+page.server');

function context(values: Record<string, string>, role = 'editor') {
  const body = new URLSearchParams(values);
  return { request: new Request('https://example.test/projects/demo/files', { method: 'POST', body }), locals: { role, username: 'ada' }, params: { slug: 'demo' } } as never;
}

describe('project file actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks viewers before writing files', async () => {
    const result = await actions.saveFile(context({ path: 'notes/readme.md', content: '# Nope' }, 'viewer'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.upsertProjectFile).not.toHaveBeenCalled();
  });

  it('saves a Markdown file and records the project activity', async () => {
    persistence.getProjectFile.mockResolvedValue(null);
    persistence.upsertProjectFile.mockResolvedValue({ id: 'file-1', projectSlug: 'demo', path: 'notes/readme.md', content: '# Ready', mimeType: 'text/markdown', size: 7, createdBy: 'ada', createdAt: '', updatedAt: '' });
    const result = await actions.saveFile(context({ path: 'notes/readme.md', content: '# Ready' }));
    expect(result).toEqual({ message: 'notes/readme.md saved.', fileId: 'file-1' });
    expect(persistence.upsertProjectFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/readme.md', mimeType: 'text/markdown', content: '# Ready' }));
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', summary: expect.stringContaining('notes/readme.md') }));
  });

  it('rejects unsupported file extensions', async () => {
    const result = await actions.saveFile(context({ path: 'assets/cover.png', content: 'not text' }));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.upsertProjectFile).not.toHaveBeenCalled();
  });

  it('lets an invited editor create a project folder', async () => {
    persistence.createProjectFolder.mockResolvedValue({ path: 'assets/screenshots' });
    const result = await actions.createFolder(context({ parent: 'assets', path: 'screenshots' }));
    expect(result).toEqual({ message: 'assets/screenshots created.' });
    expect(persistence.createProjectFolder).toHaveBeenCalledWith('demo', 'assets/screenshots', 'ada');
  });
});
