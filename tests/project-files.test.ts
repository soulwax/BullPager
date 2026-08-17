import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createProjectFolder: vi.fn(),
  deleteProjectFolder: vi.fn(),
  deleteProjectFile: vi.fn(),
  getBoardProject: vi.fn(),
  getProjectFile: vi.fn(),
  getProjectFileByPath: vi.fn(),
  listProjectActivity: vi.fn().mockResolvedValue([]),
  listProjectFiles: vi.fn(),
  listProjectFolders: vi.fn(),
  moveProjectFile: vi.fn(),
  normalizeProjectPath: (value: string) => value.replaceAll('\\', '/'),
  normalizeProjectFilePath: (value: string) => value.replaceAll('\\', '/'),
  recordProjectActivity: vi.fn(),
  upsertProjectFile: vi.fn()
}));

const r2 = vi.hoisted(() => ({
  copyProjectFileObject: vi.fn(),
  deleteProjectFileObject: vi.fn(),
  getProjectFileObjectUrl: vi.fn(),
  projectFileObjectKey: (project: string, id: string, path: string) => `${project}/${id}/${path}`,
  putProjectFileObject: vi.fn(),
  r2Configured: () => false
}));

vi.mock('../src/lib/server/persistence', () => persistence);
vi.mock('../src/lib/server/r2', () => r2);

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

  it('moves a file without overwriting another file', async () => {
    const current = { id: 'file-1', projectSlug: 'demo', path: 'notes/readme.md', content: '# Ready', mimeType: 'text/markdown', size: 7, createdBy: 'ada', createdAt: '', updatedAt: '' };
    persistence.getProjectFile.mockResolvedValue(current);
    persistence.getProjectFileByPath.mockResolvedValue(null);
    persistence.moveProjectFile.mockResolvedValue({ ...current, path: 'docs/readme.md' });
    const result = await actions.moveFile(context({ id: 'file-1', path: 'docs/readme.md' }));
    expect(result).toEqual({ message: 'docs/readme.md moved.', fileId: 'file-1' });
    expect(persistence.moveProjectFile).toHaveBeenCalledWith('demo', 'file-1', 'docs/readme.md');
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'updated', summary: expect.stringContaining('Moved file') }));
  });

  it('refuses to delete a non-empty folder', async () => {
    persistence.deleteProjectFolder.mockRejectedValue(new Error('FOLDER_NOT_EMPTY'));
    const result = await actions.deleteFolder(context({ path: 'assets' }));
    expect(result).toMatchObject({ status: 409 });
    expect(persistence.recordProjectActivity).not.toHaveBeenCalled();
  });
});
