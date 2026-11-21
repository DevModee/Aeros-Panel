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

export async function initializeDatabase() {
    const hasUsersTable = await db.schema.hasTable('users');
    if (!hasUsersTable) {
        await db.schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username').notNullable().unique();
            table.string('password').notNullable();
            table.integer('created_at').defaultTo(Date.now());
        });
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
