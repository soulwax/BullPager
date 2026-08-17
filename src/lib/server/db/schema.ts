import { bigserial, boolean, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { GraphEdgeKind, GraphNodeKind, PacketState, UserRole } from '$lib/types';

const createdAt = (name = 'created_at') => timestamp(name, { withTimezone: true, mode: 'string' }).notNull().defaultNow();

export const packetTransitions = pgTable('packet_transitions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  packetId: text('packet_id').notNull(),
  nextState: text('next_state').$type<PacketState>().notNull(),
  owner: text('owner').notNull().default(''),
  evidence: text('evidence').notNull().default(''),
  remainder: text('remainder').notNull().default(''),
  sourceHash: text('source_hash').notNull(),
  createdAt: createdAt()
}, (table) => ({ packetCreatedIndex: index('packet_transitions_packet_created_idx').on(table.packetId, table.createdAt) }));

export const packetNotes = pgTable('packet_notes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  packetId: text('packet_id').notNull(),
  author: text('author').notNull().default(''),
  body: text('body').notNull(),
  createdAt: createdAt()
});

export const boardUsers = pgTable('board_users', {
  username: text('username').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<Exclude<UserRole, 'superadmin'>>().notNull(),
  githubId: text('github_id'),
  createdAt: createdAt()
}, (table) => ({ githubIndex: uniqueIndex('board_users_github_id_idx').on(table.githubId) }));

export const boardProjects = pgTable('board_projects', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  visibility: text('visibility').$type<'private' | 'shared'>().notNull().default('private'),
  createdAt: createdAt()
});

export const boardSettings = pgTable('board_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

export const boardProjectCards = pgTable('board_project_cards', {
  id: text('id').primaryKey(),
  projectSlug: text('project_slug').notNull(),
  title: text('title').notNull(),
  details: text('details').notNull().default(''),
  lane: text('lane').notNull(),
  position: integer('position').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  checklist: text('checklist').notNull().default('[]'),
  coverColor: text('cover_color').notNull().default(''),
  owner: text('owner').notNull().default(''),
  priority: text('priority').$type<'low' | 'normal' | 'high' | 'urgent'>().notNull().default('normal'),
  dueDate: date('due_date'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
}, (table) => ({ projectLaneIndex: index('board_project_cards_project_lane_idx').on(table.projectSlug, table.lane) }));

export const boardProjectTags = pgTable('board_project_tags', {
  id: text('id').primaryKey(),
  projectSlug: text('project_slug').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: createdAt()
}, (table) => ({ projectNameIndex: uniqueIndex('board_project_tags_project_name_idx').on(table.projectSlug, table.name) }));

export const boardProjectCardTags = pgTable('board_project_card_tags', {
  cardId: text('card_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: createdAt()
}, (table) => ({ cardTagPrimaryKey: primaryKey({ columns: [table.cardId, table.tagId] }), tagCardIndex: index('board_project_card_tags_tag_card_idx').on(table.tagId, table.cardId) }));

export const boardProjectCardWatchers = pgTable('board_project_card_watchers', {
  cardId: text('card_id').notNull(),
  username: text('username').notNull(),
  createdAt: createdAt()
}, (table) => ({ watcherPrimaryKey: primaryKey({ columns: [table.cardId, table.username] }), cardWatcherIndex: index('board_project_card_watchers_card_idx').on(table.cardId) }));

export const boardProjectViews = pgTable('board_project_views', {
  projectSlug: text('project_slug').notNull(),
  username: text('username').notNull(),
  state: text('state').notNull().default('{}'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
}, (table) => ({ projectUserPrimaryKey: primaryKey({ columns: [table.projectSlug, table.username] }) }));

export const boardProjectActivity = pgTable('board_project_activity', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectSlug: text('project_slug').notNull(),
  actor: text('actor').notNull().default(''),
  action: text('action').$type<'created' | 'updated' | 'deleted'>().notNull(),
  cardId: text('card_id').notNull().default(''),
  summary: text('summary').notNull().default(''),
  createdAt: createdAt()
}, (table) => ({ projectCreatedIndex: index('board_project_activity_project_created_idx').on(table.projectSlug, table.createdAt) }));

export const boardProjectComments = pgTable('board_project_comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectSlug: text('project_slug').notNull(),
  cardId: text('card_id').notNull(),
  author: text('author').notNull(),
  body: text('body').notNull(),
  createdAt: createdAt()
}, (table) => ({ cardCreatedIndex: index('board_project_comments_card_created_idx').on(table.cardId, table.createdAt) }));

export const boardProjectGraphs = pgTable('board_project_graphs', {
  projectSlug: text('project_slug').primaryKey(),
  revision: integer('revision').notNull().default(1),
  settings: text('settings').notNull().default('{}'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

export const boardProjectGraphNodes = pgTable('board_project_graph_nodes', {
  id: text('id').primaryKey(),
  projectSlug: text('project_slug').notNull(),
  kind: text('kind').$type<GraphNodeKind>().notNull(),
  cardId: text('card_id'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  x: integer('x').notNull().default(80),
  y: integer('y').notNull().default(80),
  width: integer('width').notNull().default(220),
  height: integer('height').notNull().default(130),
  color: text('color').notNull().default('#5E9CFF'),
  collapsed: boolean('collapsed').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdBy: text('created_by').notNull().default('unknown'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
}, (table) => ({ projectIndex: index('board_project_graph_nodes_project_idx').on(table.projectSlug) }));

export const boardProjectGraphEdges = pgTable('board_project_graph_edges', {
  id: text('id').primaryKey(),
  projectSlug: text('project_slug').notNull(),
  sourceNodeId: text('source_node_id').notNull(),
  targetNodeId: text('target_node_id').notNull(),
  kind: text('kind').$type<GraphEdgeKind>().notNull(),
  label: text('label').notNull().default(''),
  createdBy: text('created_by').notNull().default('unknown'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
}, (table) => ({ projectIndex: index('board_project_graph_edges_project_idx').on(table.projectSlug) }));

export const schema = { packetTransitions, packetNotes, boardUsers, boardProjects, boardSettings, boardProjectCards, boardProjectTags, boardProjectCardTags, boardProjectCardWatchers, boardProjectViews, boardProjectActivity, boardProjectComments, boardProjectGraphs, boardProjectGraphNodes, boardProjectGraphEdges };
