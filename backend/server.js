import express from 'express';
import authRoutes from './routes/auth.js';
import repoRoute from './routes/repos.js';
import treeRoute from './routes/tree.js';
import fsRoute from './routes/fs.js';
import uploadRoute from './routes/upload.js';
import planRoute from './routes/plan.js';
import releaseRoute from './routes/release.js';
import browseRoute from './routes/browse.js';

const app = express();
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json({ message: 'backend is running' })
});

app.use('/api/auth',authRoutes);
app.use('/api/repos',repoRoute);
app.use('/api/tree',treeRoute);
app.use('/api/fs',fsRoute);
app.use('/api/upload',uploadRoute);
app.use('/api/plan',planRoute);
app.use('/api/release',releaseRoute);
app.use('/api/browse',browseRoute);

app.listen(3001, '127.0.0.1', () => {
  console.log('Server running on http://127.0.0.1:3001')
});
