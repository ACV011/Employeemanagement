const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(cors({
    origin: 'http://localhost:3000', 
    credentials: true  
}));

const pool = new Pool({
    user: "postgres",
    password: "arundath",
    database: "hirel",
    port: 5432,
    host: "localhost"
});

app.post('/login', async (req, res) => {
    const { fullName, password } = req.body;
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM users WHERE full_name = $1', [fullName]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const checkPassword = await bcrypt.compare(password, user.password);
            if (checkPassword) {
                return res.status(200).json({ 
                    message: 'Login successful', 
                    user: {
                        ...user,
                        id: user.id 
                    }
                });
            }
        }
        res.status(401).json({ message: 'Invalid Username or password' });
    } catch (error) {
        console.error('Error checking user credentials:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});


app.post('/signup', async (req, res) => {
    const { fullName, mobileNumber, email, password } = req.body;
    const client = await pool.connect();
    try {
        const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await client.query(
            'INSERT INTO users (full_name, mobile_number, email, password) VALUES ($1 , $2, $3, $4)',
            [fullName, mobileNumber, email, hashedPassword]
        );
        res.status(201).json({ message: 'Signup successful' });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});

app.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/users', async (req, res) => {
    const { full_name, mobile_number, email, password, role, department, status } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (full_name, mobile_number, email, password, role, department, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [full_name, mobile_number, email, hashedPassword, role, department, status || 'Active']
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, mobile_number, email, role, department, status } = req.body;
    try {
        const updateQuery = `
            UPDATE users 
            SET full_name = $1, mobile_number = $2, email = $3, role = $4, department = $5, status = $6
            WHERE id = $7 RETURNING *`;

        const values = [full_name, mobile_number, email, role, department, status, id];

        const result = await pool.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/activities', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, activity_type, assigned_user, target_day, target_cycle_time FROM activities');
        const activities = result.rows.map(activity => {
            return {
                ...activity,
                assigned_user: Array.isArray(activity.assigned_user) ? activity.assigned_user : []
            };
        });
        res.status(200).json(activities);
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/assigned-activities/:userName', async (req, res) => {
    const { userName } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, activity_type, target_day, target_cycle_time FROM activities WHERE $1 = ANY(assigned_user)',
            [userName]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching assigned activities:', error);
        res.status(500).json({ message: 'Failed to fetch activities' });
    }
});


app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT full_name FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});



app.get('/assigned-activities', async (req, res) => {
    try {
        const userId = req.user.id; 
        const activities = await db.query('SELECT * FROM activities WHERE assigned_user_id = $1', [userId]);
        res.json(activities.rows);
    } catch (error) {
        console.error('Error fetching assigned activities:', error);
        res.status(500).json({ message: 'Failed to fetch activities' });
    }
});

app.post('/save-scan', async (req, res) => {
    const { username, login_time, target_day, barcode } = req.body;

    try {
        await pool.query(
            'INSERT INTO scan_data (username,   login_time, target_day, barcode) VALUES ($1, $2, $3, $4)',
            [username, login_time, target_day, barcode]
        );
        res.status(200).send('Scan data saved successfully');
    } catch (error) {
        console.error('Error saving scan data:', error);
        res.status(500).send('Error saving scan data');
    }
});



app.post('/activities', async (req, res) => {
    const { activity_type, assigned_user, target_day, target_cycle_time } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO activities (activity_type, assigned_user, target_day, target_cycle_time) VALUES ($1, $2, $3, $4) RETURNING *',
            [activity_type, assigned_user, target_day, target_cycle_time]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding activity:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.put('/activities/:id', async (req, res) => {
    const { id } = req.params;
    const { activity_type, assigned_user, target_day, target_cycle_time } = req.body;
    try {
        const result = await pool.query(
            'UPDATE activities SET activity_type = $1, assigned_user = $2, target_day = $3, target_cycle_time = $4 WHERE id = $5 RETURNING *',
            [activity_type, assigned_user, target_day, target_cycle_time, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating activity:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.delete('/activities/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM activities WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        res.status(200).json({ message: 'Activity deleted successfully' });
    } catch (error) {
        console.error('Error deleting activity:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.delete('/delete-barcode/:barcode', async (req, res) => {
    const { barcode } = req.params;
    try {
      const result = await pool.query('DELETE FROM scan_data WHERE barcode = $1 RETURNING *', [barcode]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Barcode not found' });
      }
  
      res.status(200).json({ message: 'Barcode deleted successfully' });
    } catch (error) {
      console.error('Error deleting barcode:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  


app.post('/logout', (req, res) => {
    res.clearCookie('connect.sid');     
    res.status(200).send('Logged out');
});
 
app.listen(PORT , () => {
    console.log(`Server is running on port ${PORT}`);
});