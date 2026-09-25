import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [connected, setConnected] = useState(false)
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [repos, setRepos] = useState([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [newFolderName, setNewFolderName] = useState('')

  const [currentPath, setCurrentPath] = useState('')   // '' means repo root
  const [folders, setFolders] = useState([])
  const [branch, setBranch] = useState('')

  const [browsing, setBrowsing] = useState(false)
  const [browsePath, setBrowsePath] = useState('')
  const [browseItems, setBrowseItems] = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])

  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadProgress, setUploadProgress] = useState('')

  const [checking, setChecking] = useState(false)
  const [conflicts, setConflicts] = useState(null) // null = not checked yet
  const [decisions, setDecisions] = useState({}) // { fileName: 'overwrite' | 'skip' | 'keep-both' }

  const [showNewRepoForm, setShowNewRepoForm] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoDescription, setNewRepoDescription] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(true)
  const [creatingRepo, setCreatingRepo] = useState(false)
  const [newRepoError, setNewRepoError] = useState('')
  const [branches, setBranches] = useState([])

  const [releaseId, setReleaseId] = useState(null)

  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'browse'
  const [remotePath, setRemotePath] = useState('')
  const [remoteEntries, setRemoteEntries] = useState([])
  const [downloadTarget, setDownloadTarget] = useState('')
  const [downloadStatus, setDownloadStatus] = useState('')

  const [pickingFolder, setPickingFolder] = useState(false)
  const [pickerPath, setPickerPath] = useState('')
  const [pickerItems, setPickerItems] = useState([])

  useEffect(() => {
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        setConnected(data.connected)
        if (data.username) setUsername(data.username)
      })
  }, [])

  useEffect(() => {
    if (!connected) return
    fetch('/api/repos')
      .then((res) => res.json())
      .then(setRepos)
  }, [connected])

  // Whenever the selected repo, path, or branch changes, fetch that folder level
  useEffect(() => {
    if (!selectedRepo || !branch) {
      setFolders([])
      return
    }
    const [owner, repo] = selectedRepo.split('/')
    const params = new URLSearchParams({ path: currentPath, branch })

    fetch(`/api/tree/${owner}/${repo}?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setFolders(data.folders)
      })
  }, [selectedRepo, currentPath, branch])

  // Whenever the selected repo changes, fetch its branch list
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([])
      return
    }
    const [owner, repo] = selectedRepo.split('/')

    fetch(`/api/repos/${owner}/${repo}/branches`)
      .then((res) => res.json())
      .then((data) => {
        setBranches(data.branches)
        setBranch(data.defaultBranch)
      })
  }, [selectedRepo])

  useEffect(() => {
    if (activeTab === 'browse' && selectedRepo && branch) {
      loadRemotePath('')
    }
  }, [activeTab, selectedRepo, branch])

  // Pre-fill the download target with the Downloads folder on load
  useEffect(() => {
    fetch('/api/fs/defaults')
      .then((res) => res.json())
      .then((data) => setDownloadTarget(data.downloads))
  }, [])

  async function handleConnect(e) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (res.ok) {
      setConnected(true)
      setUsername(data.username)
    } else {
      setError(data.error)
    }
  }

  async function handleCheckAndUpload() {
    if (!selectedRepo || selectedFiles.length === 0) return

    setChecking(true)
    setUploadResult(null)

    const [owner, repo] = selectedRepo.split('/')

    const planRes = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        repo,
        branch,
        files: selectedFiles.map((f) => {
          // Folder-sourced files keep their nested structure; plain files go directly in currentPath
          const targetPath = f.folderRoot
            ? (currentPath ? `${currentPath}/${f.folderRoot}/${f.relativePath}` : `${f.folderRoot}/${f.relativePath}`)
            : (currentPath ? `${currentPath}/${f.name}` : f.name)
          return { path: f.path, name: f.name, targetPath }
        }),
      }),
    })
    const planData = await planRes.json()

    if (!planRes.ok) {
      setChecking(false)
      if (planRes.status === 404) {
        setRepos((prev) => prev.filter((r) => r.fullName !== selectedRepo))
        setSelectedRepo('')
      }
      setUploadResult({ success: false, error: planData.error || 'Failed to check for conflicts' })
      return
    }

    const releasePendingFiles = planData.results.filter((r) => r.status === 'release-pending')
    let releaseResults = []
    let newReleaseId = null

    if (releasePendingFiles.length > 0) {
      const releaseRes = await fetch('/api/release/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          files: releasePendingFiles.map((f) => ({ name: f.name })),
        }),
      })
      const releaseData = await releaseRes.json()
      setChecking(false)

      if (!releaseRes.ok) {
        setUploadResult({ success: false, error: releaseData.error || 'Failed to check release assets' })
        return
      }

      newReleaseId = releaseData.releaseId
      const releaseStatusByName = new Map(releaseData.results.map((r) => [r.name, r.status]))
      releaseResults = releasePendingFiles.map((f) => ({
        ...f,
        status: releaseStatusByName.get(f.name),
      }))
    } else {
      setChecking(false)
    }

    const nonReleaseResults = planData.results.filter((r) => r.status !== 'release-pending')
    const combined = [...nonReleaseResults, ...releaseResults]

    setReleaseId(newReleaseId)

    const blockedFiles = combined.filter((r) => r.status === 'blocked')
    const hasConflicts = combined.some((r) => r.status === 'conflict' || r.status === 'name-clash-folder')

    if (blockedFiles.length > 0 || hasConflicts) {
      setConflicts(combined)
    } else {
      const filesToUpload = combined.filter((r) => r.status === 'new')
      runUpload(filesToUpload)
    }
  }

  async function runUpload(filesToUpload,releaseIdOverride) {
    if (filesToUpload.length === 0) {
      setUploadResult({ success: true, url: null, skipped: true })
      return
    }

    setUploading(true)
    setUploadProgress('Preparing...')

    const [owner, repo] = selectedRepo.split('/')
    const commitFiles = filesToUpload.filter((f) => f.method === 'commit')
    const releaseFiles = filesToUpload.filter((f) => f.method === 'release')

    const results = { commitUrl: null, releaseUrl: null, errors: [] }

    if (commitFiles.length > 0) {
      setUploadProgress(`Committing ${commitFiles.length} file(s)...`)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          files: commitFiles.map((f) => ({ path: f.path, targetPath: f.targetPath })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        results.commitUrl = data.commitUrl
      } else {
        results.errors.push(`Commit failed: ${data.error}`)
      }
    }

    if (releaseFiles.length > 0) {
      for (let i = 0; i < releaseFiles.length; i++) {
        const file = releaseFiles[i]
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${releaseFiles.length})...`)

        const res = await fetch('/api/release/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner,
            repo,
            releaseId: releaseIdOverride ?? releaseId,
            files: [{ path: file.path, name: file.name }],
          }),
        })
        const data = await res.json()
        if (res.ok) {
          results.releaseUrl = data.releaseUrl
        } else {
          results.errors.push(`${file.name} failed: ${data.error}`)
        }
      }
    }

    setUploading(false)
    setUploadProgress('')
    setConflicts(null)

    if (results.errors.length > 0) {
      setUploadResult({ success: false, error: results.errors.join('; ') })
    } else {
      setUploadResult({ success: true, commitUrl: results.commitUrl, releaseUrl: results.releaseUrl })
    }
    setSelectedFiles([])
  }

  function resolveConflictsAndUpload() {
    const filesToUpload = []

    for (const result of conflicts) {
      if (result.status === 'blocked') continue
      if (result.status === 'new') {
        filesToUpload.push(result)
        continue
      }
      if (result.status === 'identical') continue

      const decision = decisions[result.name] || 'skip'
      if (decision === 'overwrite') {
        filesToUpload.push(result)
      } else if (decision === 'keep-both') {
        const dotIndex = result.name.lastIndexOf('.')
        const renamed =
          dotIndex > 0
            ? `${result.name.slice(0, dotIndex)} (1)${result.name.slice(dotIndex)}`
            : `${result.name} (1)`
        // Rebuild targetPath with the renamed file, keeping the same destination folder
        const folder = result.targetPath.includes('/')
          ? result.targetPath.slice(0, result.targetPath.lastIndexOf('/'))
          : ''
        const renamedTargetPath = folder ? `${folder}/${renamed}` : renamed
        filesToUpload.push({ ...result, name: renamed, targetPath: renamedTargetPath })
      }
    }

    runUpload(filesToUpload,newreleaseId)
  }

  function handleRepoChange(fullName) {
    setSelectedRepo(fullName)
    setCurrentPath('')
    setBranch('')
  }

  async function handleCreateRepo(e) {
    e.preventDefault()
    setCreatingRepo(true)
    setNewRepoError('')

    const res = await fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRepoName,
        description: newRepoDescription,
        isPrivate: newRepoPrivate,
      }),
    })
    const data = await res.json()
    setCreatingRepo(false)

    if (res.ok) {
      setRepos((prev) => [data, ...prev])
      handleRepoChange(data.fullName)
      setShowNewRepoForm(false)
      setNewRepoName('')
      setNewRepoDescription('')
    } else {
      setNewRepoError(data.error)
    }
  }

  function goUp() {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath(parts.join('/'))
  }

  function openBrowser() {
    setBrowsing(true)
    loadBrowsePath('')
  }

  function loadBrowsePath(targetPath) {
    const params = new URLSearchParams()
    if (targetPath) params.set('path', targetPath)

    fetch(`/api/fs/list?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setBrowsePath(data.path)
        setBrowseItems(data.items)
      })
  }

  function browseUp() {
    const parts = browsePath.split('/').filter(Boolean)
    parts.pop()
    loadBrowsePath('/' + parts.join('/'))
  }

  function toggleFileSelect(item) {
    setSelectedFiles((prev) => {
      const exists = prev.find((f) => f.path === item.path)
      if (exists) {
        return prev.filter((f) => f.path !== item.path)
      }
      return [...prev, item]
    })
  }

  function loadRemotePath(path) {
    if (!selectedRepo || !branch) return
    const [owner, repo] = selectedRepo.split('/')
    const params = new URLSearchParams({ path, branch })

    fetch(`/api/browse/${owner}/${repo}?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setRemotePath(path)
        setRemoteEntries(data.entries)
      })
  }

  function remoteUp() {
    const parts = remotePath.split('/').filter(Boolean)
    parts.pop()
    loadRemotePath(parts.join('/'))
  }

  async function handleDownload(entry) {
    setDownloadStatus(`Downloading ${entry.name}...`)
    const [owner, repo] = selectedRepo.split('/')
    const params = new URLSearchParams({
      path: entry.path,
      branch,
      saveTo: downloadTarget,
    })

    const res = await fetch(`/api/browse/${owner}/${repo}/download?${params}`)
    const data = await res.json()

    if (res.ok) {
      setDownloadStatus(`Saved to ${data.savedTo}`)
    } else {
      setDownloadStatus(`Failed: ${data.error}`)
    }
  }

  function openFolderPicker() {
    setPickingFolder(true)
    fetch('/api/fs/defaults')
      .then((res) => res.json())
      .then((data) => loadPickerPath(data.downloads))
  }

  async function selectFolder(item) {
    const params = new URLSearchParams({ path: item.path })
    const res = await fetch(`/api/fs/walk?${params}`)
    const data = await res.json()

    if (!res.ok) {
      alert(data.error || 'Failed to read folder')
      return
    }

    // Add every file in the folder to the queue, tagged with which folder it came from
    // so we know to preserve the nested structure when uploading
    const folderFiles = data.files.map((f) => ({
      path: f.path,
      name: f.name,
      size: f.size,
      relativePath: f.relativePath,
      folderRoot: data.rootName,
    }))

    setSelectedFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path))
      const newOnes = folderFiles.filter((f) => !existingPaths.has(f.path))
      return [...prev, ...newOnes]
    })
  }

  function loadPickerPath(targetPath) {
    const params = new URLSearchParams()
    if (targetPath) params.set('path', targetPath)

    fetch(`/api/fs/list?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setPickerPath(data.path)
        setPickerItems(data.items.filter((i) => i.isDir))
      })
  }

  function pickerUp() {
    const parts = pickerPath.split('/').filter(Boolean)
    parts.pop()
    loadPickerPath('/' + parts.join('/'))
  }

  function selectDownloadFolder() {
    setDownloadTarget(pickerPath)
    setPickingFolder(false)
  }

  if (!connected) {
    return (
      <div>
        <h1>GitDrop</h1>
        <div className="panel">
          <p>Connect your GitHub account to get started.</p>
          <form onSubmit={handleConnect}>
            <input
              type="password"
              placeholder="GitHub personal access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ width: '300px', marginRight: '8px' }}
            />
            <button type="submit" className="primary">Connect</button>
          </form>
          {error && <p className="status-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>GitDrop</h1>
      <p>Connected as <strong style={{ color: 'var(--fg-default)' }}>{username}</strong></p>

      <div className="panel">
        <select
          value={selectedRepo}
          onChange={(e) => {
            if (e.target.value === '__new__') {
              setShowNewRepoForm(true)
            } else {
              handleRepoChange(e.target.value)
            }
          }}
          style={{ width: '100%' }}
        >
          <option value="">Select a repository...</option>
          <option value="__new__">+ New repository</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.fullName}>
              {repo.fullName} {repo.private ? '(private)' : ''}
            </option>
          ))}
        </select>

        {showNewRepoForm && (
          <div className="panel" style={{ marginTop: '12px' }}>
            <form onSubmit={handleCreateRepo}>
              <div style={{ marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Repository name"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newRepoDescription}
                  onChange={(e) => setNewRepoDescription(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={newRepoPrivate}
                    onChange={(e) => setNewRepoPrivate(e.target.checked)}
                    style={{ marginRight: '6px' }}
                  />
                  Private
                </label>
              </div>
              <button type="submit" className="primary" disabled={creatingRepo}>
                {creatingRepo ? 'Creating...' : 'Create repository'}
              </button>{' '}
              <button type="button" onClick={() => setShowNewRepoForm(false)}>
                Cancel
              </button>
              {newRepoError && <p className="status-error">{newRepoError}</p>}
            </form>
          </div>
        )}

        {selectedRepo && branches.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <label>
              Branch:{' '}
              <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {selectedRepo && (
        <div className="tabs">
          <button
            className={activeTab === 'upload' ? 'active' : ''}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
          <button
            className={activeTab === 'browse' ? 'active' : ''}
            onClick={() => setActiveTab('browse')}
          >
            Browse remote
          </button>
        </div>
      )}

      {activeTab === 'upload' && selectedRepo && (
        <div className="panel">
          <div className="path-row">
            📍 /{currentPath}
            {currentPath && <button onClick={goUp}>↑ up</button>}
          </div>

          {folders.length > 0 && (
            <ul className="file-list">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <button
                    onClick={() => setCurrentPath(folder.path)}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    📁 {folder.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {folders.length === 0 && <p>No subfolders here.</p>}

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              type="text"
              placeholder="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              onClick={() => {
                if (!newFolderName) return
                const newPath = currentPath ? `${currentPath}/${newFolderName}` : newFolderName
                setCurrentPath(newPath)
                setNewFolderName('')
              }}
            >
              Use this new folder
            </button>
          </div>

          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-muted)', paddingTop: '16px' }}>
            <button onClick={openBrowser}>Browse files...</button>

            {browsing && (
              <div className="panel">
                <div className="path-row">
                  💻 {browsePath}
                  <button onClick={browseUp}>↑ up</button>
                  <button onClick={() => setBrowsing(false)}>Close</button>
                </div>
                <ul className="file-list">
                  {browseItems.map((item) => (
                    <li key={item.path}>
                      {item.isDir ? (
                          <span className="file-row-left" style={{ width: '100%' }}>
                            <button
                              onClick={() => loadBrowsePath(item.path)}
                              style={{ background: 'none', border: 'none', textAlign: 'left', flex: 1 }}
                            >
                              📁 {item.name}
                            </button>
                            <button onClick={() => selectFolder(item)}>Select whole folder</button>
                          </span>
                        ) : (
                        <label className="file-row-left" style={{ width: '100%' }}>
                          <input
                            type="checkbox"
                            checked={!!selectedFiles.find((f) => f.path === item.path)}
                            onChange={() => toggleFileSelect(item)}
                          />
                          <span>{item.name}</span>
                          <span className="file-size">({(item.size / 1024).toFixed(1)} KB)</span>
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedFiles.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p>Queue ({selectedFiles.length} files):</p>
                <ul className="file-list">
                    {selectedFiles.map((f) => (
                      <li key={f.path}>
                        <span className="file-row-left">
                          {f.folderRoot ? `${f.folderRoot}/${f.relativePath}` : f.name}
                          <span className="file-size">({(f.size / 1024).toFixed(1)} KB)</span>
                        </span>
                        <button className="danger-text" onClick={() => toggleFileSelect(f)}>
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
                <button className="primary" onClick={handleCheckAndUpload} disabled={checking || uploading}>
                  {checking ? 'Checking...' : uploading ? uploadProgress : `Upload ${selectedFiles.length} file(s)`}
                </button>

                {uploadResult && uploadResult.success && (
                  <p className="status-success">
                    {uploadResult.skipped ? (
                      'Nothing to upload — all files already up to date.'
                    ) : (
                      <>
                        Uploaded!{' '}
                        {uploadResult.commitUrl && (
                          <a href={uploadResult.commitUrl} target="_blank" rel="noreferrer">View commit</a>
                        )}
                        {uploadResult.commitUrl && uploadResult.releaseUrl && ' | '}
                        {uploadResult.releaseUrl && (
                          <a href={uploadResult.releaseUrl} target="_blank" rel="noreferrer">View release</a>
                        )}
                      </>
                    )}
                  </p>
                )}
                {uploadResult && !uploadResult.success && (
                  <p className="status-error">Upload failed: {uploadResult.error}</p>
                )}

                {conflicts && (
                  <div className="panel panel-warning">
                    <p>Review before uploading:</p>
                    <ul className="file-list">
                      {conflicts
                        .filter((c) => c.status !== 'new' && c.status !== 'identical')
                        .map((c) => (
                          <li key={c.name}>
                            <span className="file-row-left">
                              {c.name}
                              <span className="file-size">({c.method})</span>
                            </span>
                            {c.status === 'blocked' && (
                              <span className="status-error">too large (over 2GB), skipped</span>
                            )}
                            {c.status === 'name-clash-folder' && (
                              <span className="status-warning">folder exists with this name, skipped</span>
                            )}
                            {c.status === 'conflict' && (
                              <select
                                value={decisions[c.name] || 'skip'}
                                onChange={(e) =>
                                  setDecisions((prev) => ({ ...prev, [c.name]: e.target.value }))
                                }
                              >
                                <option value="skip">Skip</option>
                                <option value="overwrite">Overwrite</option>
                                <option value="keep-both">Keep both</option>
                              </select>
                            )}
                          </li>
                        ))}
                    </ul>
                    <button className="primary" onClick={resolveConflictsAndUpload}>Confirm and upload</button>{' '}
                    <button onClick={() => setConflicts(null)}>Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'browse' && selectedRepo && (
        <div className="panel">
          <div className="path-row">
            📍 /{remotePath}
            {remotePath && <button onClick={remoteUp}>↑ up</button>}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <p>
              Save downloads to: <strong style={{ color: 'var(--fg-default)' }}>{downloadTarget || '(home folder)'}</strong>{' '}
              <button onClick={openFolderPicker}>Choose folder...</button>
            </p>

            {pickingFolder && (
              <div className="panel">
                <div className="path-row">
                  💻 {pickerPath}
                  <button onClick={pickerUp}>↑ up</button>
                  <button onClick={() => setPickingFolder(false)}>Close</button>
                </div>
                <ul className="file-list">
                  {pickerItems.map((item) => (
                    <li key={item.path}>
                      <button
                        onClick={() => loadPickerPath(item.path)}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                      >
                        📁 {item.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="primary" onClick={selectDownloadFolder}>
                  Select this folder ({pickerPath})
                </button>
              </div>
            )}
          </div>

          <ul className="file-list">
            {remoteEntries.map((entry) => (
              <li key={entry.path}>
                {entry.type === 'dir' ? (
                  <button
                    onClick={() => loadRemotePath(entry.path)}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    📁 {entry.name}
                  </button>
                ) : (
                  <>
                    <span className="file-row-left">
                      📄 {entry.name}
                      <span className="file-size">({(entry.size / 1024).toFixed(1)} KB)</span>
                    </span>
                    <button onClick={() => handleDownload(entry)}>Download</button>
                  </>
                )}
              </li>
            ))}
          </ul>

          {downloadStatus && <p className="status-success">{downloadStatus}</p>}
        </div>
      )}
    </div>
  )
}

export default App