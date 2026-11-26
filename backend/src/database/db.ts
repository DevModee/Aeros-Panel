import knex from 'knex';
import path from 'path';
import { hashPassword } from '../auth/crypto';

const dbPath = process.env.AEROS_DB_PATH
    ? path.resolve(process.env.AEROS_DB_PATH)
    : path.resolve(__dirname, '../../aeros.db');

export const db = knex({
    client: 'sqlite3',
    connection: {
        filename: dbPath
    },
    useNullAsDefault: true
});

async function ensureProjectColumns() {
    const columns: Array<{ name: string; add: (table: knex.Knex.AlterTableBuilder) => void }> = [
        { name: 'template', add: (t) => t.string('template').defaultTo('custom') },
        { name: 'work_dir', add: (t) => t.string('work_dir').nullable() },
        { name: 'exec_start', add: (t) => t.string('exec_start').nullable() },
        { name: 'build_cmd', add: (t) => t.string('build_cmd').nullable() },
        { name: 'run_user', add: (t) => t.string('run_user').nullable() },
        { name: 'memory_max', add: (t) => t.string('memory_max').nullable() },
        { name: 'cpu_quota', add: (t) => t.string('cpu_quota').nullable() },
        { name: 'last_deploy_at', add: (t) => t.string('last_deploy_at').nullable() },
        { name: 'current_commit', add: (t) => t.string('current_commit').nullable() },
        { name: 'previous_commit', add: (t) => t.string('previous_commit').nullable() },
        { name: 'webhook_secret', add: (t) => t.string('webhook_secret').nullable() },
        { name: 'domain', add: (t) => t.string('domain').nullable() },
        { name: 'port', add: (t) => t.integer('port').nullable() }
    ];

    for (const col of columns) {
        const exists = await db.schema.hasColumn('projects', col.name);
        if (!exists) {
            await db.schema.alterTable('projects', (table) => {
                col.add(table);
            });
        }
    }
}

async function ensureUserColumns() {
    const hasCreatedAt = await db.schema.hasColumn('users', 'created_at');
    if (!hasCreatedAt) {
        await db.schema.alterTable('users', (table) => {
            table.integer('created_at').nullable();
        });
    }
}

export async function initializeDatabase() {
    const hasUsersTable = await db.schema.hasTable('users');
    if (!hasUsersTable) {
        await db.schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username').notNullable().unique();
            table.string('password').notNullable();
            table.integer('created_at').defaultTo(Date.now());
        });
    } else {
        await ensureUserColumns();
    }

    const hasSessionsTable = await db.schema.hasTable('sessions');
    if (!hasSessionsTable) {
        await db.schema.createTable('sessions', (table) => {
            table.string('token').primary();
            table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
            table.integer('expires_at').notNullable();
            table.integer('created_at').notNullable();
        });
    }

    const hasSettingsTable = await db.schema.hasTable('settings');
    if (!hasSettingsTable) {
        await db.schema.createTable('settings', (table) => {
            table.string('key').primary();
            table.text('value').notNullable();
        });
    }

    const hasProjectsTable = await db.schema.hasTable('projects');
    if (!hasProjectsTable) {
        await db.schema.createTable('projects', (table) => {
            table.increments('id').primary();
            table.string('name').notNullable();
            table.string('service_name').notNullable().unique();
            table.string('repository').nullable();
            table.string('branch').defaultTo('main');
            table.boolean('autostart').defaultTo(false);
            table.boolean('use_tailscale').defaultTo(false);
            table.text('env_vars').nullable();
            table.string('template').defaultTo('custom');
            table.string('work_dir').nullable();
            table.string('exec_start').nullable();
            table.string('build_cmd').nullable();
            table.string('run_user').nullable();
            table.string('memory_max').nullable();
            table.string('cpu_quota').nullable();
            table.string('last_deploy_at').nullable();
            table.string('current_commit').nullable();
            table.string('previous_commit').nullable();
            table.string('webhook_secret').nullable();
            table.string('domain').nullable();
            table.integer('port').nullable();
        });
    } else {
        await ensureProjectColumns();
    }

    const hasBackupJobsTable = await db.schema.hasTable('backup_jobs');
    if (!hasBackupJobsTable) {
        await db.schema.createTable('backup_jobs', (table) => {
            table.increments('id').primary();
            table.string('name').notNullable().unique();
            table.text('paths').notNullable();
            table.string('schedule').notNullable().defaultTo('daily');
            table.boolean('enabled').notNullable().defaultTo(false);
            table.integer('created_at').notNullable();
        });
    }

    // Optional headless admin bootstrap via environment variable
    const initialPassword = process.env.AEROS_ADMIN_PASSWORD?.trim();
    if (initialPassword) {
        const countResult = await db('users').count<{ count: number | string }>('id as count').first();
        const userCount = Number(countResult?.count ?? 0);
        if (userCount === 0) {
            const username = (process.env.AEROS_ADMIN_USER || 'admin').trim();
            const passwordHash = await hashPassword(initialPassword);
            await db('users').insert({
                username,
                password: passwordHash,
                created_at: Date.now()
            });
            console.log(`Initialized admin account "${username}" from environment.`);
        }
    }
}
