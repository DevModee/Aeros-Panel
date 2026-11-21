import dotenv from 'dotenv';
import { db, initializeDatabase } from './database/db';
import { hashPassword } from './auth/crypto';

dotenv.config();

async function main() {
    const username = (process.argv[2] || process.env.AEROS_ADMIN_USER || 'admin').trim();
    const password = (process.argv[3] || process.env.AEROS_ADMIN_PASSWORD || '').trim();

    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        console.error('Invalid username. Use 3-32 letters, numbers, underscores, or hyphens.');
        process.exit(1);
    }

    if (password.length < 10) {
        console.error('Password must be at least 10 characters.');
        process.exit(1);
    }

    await initializeDatabase();

    const passwordHash = await hashPassword(password);
    const existing = await db('users').where('username', username).first();

    if (existing) {
        await db('users').where('id', existing.id).update({ password: passwordHash });
        await db('sessions').where('user_id', existing.id).del();
        console.log(`Updated password for user "${username}".`);
    } else {
        await db('users').insert({
            username,
            password: passwordHash,
            created_at: Date.now()
        });
        console.log(`Created admin user "${username}".`);
    }

    await db.destroy();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
