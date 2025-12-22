// State
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let timerInterval = null;
let currentEntryId = null;
let entries = [];
let interviewQuestions = [];
let currentQuestionIndex = 0;

// Elements
const recordBtn = document.getElementById('record-btn');
const micIcon = document.getElementById('mic-icon');
const stopIcon = document.getElementById('stop-icon');
const recordStatus = document.getElementById('record-status');
const recordTime = document.getElementById('record-time');
const dataSafety = document.getElementById('data-safety');
const safetyIcon = document.getElementById('safety-icon');
const safetyText = document.getElementById('safety-text');
const entriesList = document.getElementById('entries-list');
const entryModal = document.getElementById('entry-modal');

// Initialize
loadEntries();
loadInterviewQuestions();

// Recording
recordBtn.addEventListener('click', toggleRecording);

async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      }
    });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        updateDataSafety('pending', 'Buffering...');
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      await uploadRecording();
    };

    mediaRecorder.start(5000);

    isRecording = true;
    recordingStartTime = Date.now();
    updateUI();
    startTimer();

  } catch (err) {
    console.error('Failed to start recording:', err);
    recordStatus.textContent = 'Microphone access denied';
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  stopTimer();
  updateUI();
  recordStatus.textContent = 'Uploading...';
}

async function uploadRecording() {
  if (audioChunks.length === 0) {
    recordStatus.textContent = 'No audio recorded';
    return;
  }

  updateDataSafety('pending', 'Uploading...');

  const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');

  try {
    const response = await fetch('/api/entries', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Upload failed');

    const entry = await response.json();
    currentEntryId = entry.id;

    updateDataSafety('safe', 'Audio saved');
    recordStatus.textContent = 'Transcribing...';

    const transcribeRes = await fetch(`/api/entries/${entry.id}/transcribe`, {
      method: 'POST',
    });

    if (transcribeRes.ok) {
      recordStatus.textContent = 'Analyzing...';

      const analyzeRes = await fetch(`/api/entries/${entry.id}/analyze`, {
        method: 'POST',
      });

      if (analyzeRes.ok) {
        recordStatus.textContent = 'Entry saved and analyzed!';
      } else {
        recordStatus.textContent = 'Entry saved (analysis pending)';
      }
    } else {
      recordStatus.textContent = 'Entry saved (transcription pending)';
    }

    await loadEntries();

    setTimeout(() => {
      recordStatus.textContent = 'Tap to start recording';
      dataSafety.style.display = 'none';
    }, 3000);

  } catch (err) {
    console.error('Upload error:', err);
    updateDataSafety('pending', 'Upload failed - retrying...');
    recordStatus.textContent = 'Upload failed';
  }
}

function updateUI() {
  recordBtn.classList.toggle('recording', isRecording);
  micIcon.style.display = isRecording ? 'none' : 'block';
  stopIcon.style.display = isRecording ? 'block' : 'none';
  recordTime.style.display = isRecording ? 'block' : 'none';
  dataSafety.style.display = isRecording ? 'flex' : 'none';

  if (isRecording) {
    recordStatus.textContent = 'Recording...';
    recordStatus.classList.add('recording');
  } else {
    recordStatus.classList.remove('recording');
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    recordTime.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateDataSafety(status, text) {
  dataSafety.style.display = 'flex';
  dataSafety.className = 'data-safety ' + status;
  safetyText.textContent = text;
}

// Entries
async function loadEntries() {
  try {
    const res = await fetch('/api/entries?limit=20');
    const data = await res.json();
    entries = data.entries;
    renderEntries();
  } catch (err) {
    console.error('Failed to load entries:', err);
    entriesList.innerHTML = '<div class="empty-state">Failed to load entries</div>';
  }
}

function renderEntries() {
  if (entries.length === 0) {
    entriesList.innerHTML = '<div class="empty-state">No entries yet. Start recording!</div>';
    return;
  }

  entriesList.innerHTML = entries.map(entry => {
    const date = new Date(entry.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });

    const statusClass = entry.status.replace('_', '-');
    const statusLabel = entry.status === 'pending_transcription' ? 'pending'
      : entry.status === 'transcribed' ? 'transcribed'
      : 'analyzed';

    const tags = entry.tags || [];

    return `
      <div class="entry-card" onclick="openEntry('${entry.id}')">
        <div class="entry-title">${entry.title || 'Untitled Entry'}</div>
        <div class="entry-meta">
          <span>${date}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        ${tags.length > 0 ? `
          <div class="entry-tags">
            ${tags.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function openEntry(id) {
  try {
    const res = await fetch(`/api/entries/${id}`);
    const entry = await res.json();

    document.getElementById('modal-title').textContent = entry.title || 'Untitled Entry';

    let analysis = null;
    if (entry.analysis_json) {
      try { analysis = JSON.parse(entry.analysis_json); } catch {}
    }

    let followUps = [];
    if (entry.follow_up_questions) {
      try { followUps = JSON.parse(entry.follow_up_questions); } catch {}
    }

    document.getElementById('modal-body').innerHTML = `
      ${entry.audio_path ? `
        <audio class="audio-player" controls src="/api/entries/${entry.id}/audio"></audio>
      ` : ''}

      <div class="transcript-section">
        <h4 style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.5rem;">Transcript</h4>
        <div class="transcript-text">${entry.transcript || 'No transcript yet'}</div>
      </div>

      <div class="action-btns">
        ${entry.status === 'pending_transcription' ? `
          <button class="action-btn primary" onclick="transcribeEntry('${entry.id}')">
            Transcribe
          </button>
        ` : ''}
        ${entry.status === 'transcribed' ? `
          <button class="action-btn primary" onclick="analyzeEntry('${entry.id}')">
            Analyze
          </button>
        ` : ''}
        <button class="action-btn" onclick="deleteEntry('${entry.id}')" style="color: var(--danger);">
          Delete
        </button>
      </div>

      ${analysis ? `
        <div class="analysis-section">
          <h4>Summary</h4>
          <p style="margin-bottom: 1rem;">${analysis.summary}</p>

          ${analysis.themes?.length ? `
            <h4>Themes</h4>
            <div class="entry-tags" style="margin-bottom: 1rem;">
              ${analysis.themes.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
          ` : ''}

          ${analysis.key_insights?.length ? `
            <h4>Key Insights</h4>
            <ul style="margin-left: 1rem; margin-bottom: 1rem;">
              ${analysis.key_insights.map(i => `<li>${i}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      ` : ''}

      ${followUps.length > 0 ? `
        <div class="analysis-section">
          <h4>Follow-up Questions</h4>
          <div class="follow-ups">
            ${followUps.map(q => `<div class="follow-up">${q}</div>`).join('')}
          </div>
        </div>
      ` : ''}
    `;

    entryModal.classList.add('open');
  } catch (err) {
    console.error('Failed to load entry:', err);
  }
}

function closeModal() {
  entryModal.classList.remove('open');
}

async function transcribeEntry(id) {
  try {
    const res = await fetch(`/api/entries/${id}/transcribe`, { method: 'POST' });
    if (res.ok) {
      await loadEntries();
      openEntry(id);
    }
  } catch (err) {
    console.error('Transcription failed:', err);
  }
}

async function analyzeEntry(id) {
  try {
    const res = await fetch(`/api/entries/${id}/analyze`, { method: 'POST' });
    if (res.ok) {
      await loadEntries();
      openEntry(id);
    }
  } catch (err) {
    console.error('Analysis failed:', err);
  }
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  try {
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    closeModal();
    await loadEntries();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

// Interview questions
async function loadInterviewQuestions() {
  try {
    const res = await fetch('/api/interview-questions');
    const data = await res.json();
    interviewQuestions = data.questions || [];

    if (interviewQuestions.length > 0) {
      const section = document.getElementById('interview-section');
      section.style.display = 'block';
      renderInterviewQuestion();
    }
  } catch (err) {
    console.error('Failed to load interview questions:', err);
  }
}

function renderInterviewQuestion() {
  const prompt = document.getElementById('interview-prompt');
  const nav = document.getElementById('interview-nav');

  prompt.textContent = interviewQuestions[currentQuestionIndex];

  nav.innerHTML = interviewQuestions.map((_, i) => `
    <button class="${i === currentQuestionIndex ? 'active' : ''}"
            onclick="showQuestion(${i})"></button>
  `).join('');
}

function showQuestion(index) {
  currentQuestionIndex = index;
  renderInterviewQuestion();
}

// Close modal on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Close modal on overlay click
entryModal.addEventListener('click', (e) => {
  if (e.target === entryModal) closeModal();
});
