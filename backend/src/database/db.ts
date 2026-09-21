import knex from 'knex';
import path from 'path';

export const db = knex({
    client: 'sqlite3',
    connection: {
        filename: path.resolve(__dirname, '../../aeros.db')
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
}
