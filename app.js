
(() => {
  "use strict";

  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const downloadAudioButton = document.getElementById("downloadAudioButton");
  const downloadTextButton = document.getElementById("downloadTextButton");
  const recordingStatus = document.getElementById("recordingStatus");
  const timer = document.getElementById("timer");
  const transcriptPlaceholder = document.getElementById("transcriptPlaceholder");
  const transcriptTag = document.getElementById("transcriptTag");
  const sessionBadge = document.getElementById("sessionBadge");
  const recorderVisual = document.getElementById("recorderVisual");

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let audioBlob = null;
  let audioUrl = null;
  let seconds = 0;
  let timerInterval = null;
  let isRecording = false;
  let recognitionShouldRun = false;
  let finalTranscript = "";
  let interimTranscript = "";

  function setStatus(message, state = "ready") {
    recordingStatus.textContent = message;

    const dot = document.createElement("span");
    dot.className = "status-dot";
    recordingStatus.prepend(dot);

    sessionBadge.replaceChildren();

    const badgeDot = document.createElement("span");
    badgeDot.className = "status-dot";

    sessionBadge.append(
      badgeDot,
      document.createTextNode(
        state === "recording" ? " RECORDING" :
        state === "stopped" ? " STOPPED" :
        state === "error" ? " CHECK SETUP" : " READY"
      )
    );

    recorderVisual.classList.toggle(
      "is-recording",
      state === "recording"
    );
  }

  function formatTime(totalSeconds) {
    const hours = String(
      Math.floor(totalSeconds / 3600)
    ).padStart(2, "0");

    const minutes = String(
      Math.floor((totalSeconds % 3600) / 60)
    ).padStart(2, "0");

    const secs = String(
      totalSeconds % 60
    ).padStart(2, "0");

    return `${hours}:${minutes}:${secs}`;
  }

  function renderTranscript() {
    const combined =
      `${finalTranscript}${interimTranscript ? " " + interimTranscript : ""}`.trim();

    transcriptPlaceholder.textContent =
      combined ||
      (isRecording
        ? "Listening... start speaking near your microphone."
        : "Your recognized speech will appear here.");

    transcriptTag.textContent = combined
      ? "LIVE TEXT"
      : (isRecording ? "LISTENING" : "WAITING");

    downloadTextButton.disabled = !finalTranscript.trim();
  }

  function stopTimer() {
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function setupRecognition() {
    if (!SpeechRecognition) {
      return null;
    }

    const instance = new SpeechRecognition();

    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-IN";

    instance.onresult = (event) => {
      interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultText = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript +=
            (finalTranscript ? " " : "") + resultText.trim();
        } else {
          interimTranscript += resultText;
        }
      }

      renderTranscript();
    };

    instance.onerror = (event) => {
      const messages = {
        "not-allowed":
          "Microphone permission denied. Allow microphone access in Chrome site settings.",

        "service-not-allowed":
          "Speech recognition service is blocked by the browser.",

        "no-speech":
          "No speech detected yet. Speak closer to the microphone and try again.",

        "audio-capture":
          "No microphone was found. Check your computer's input device.",

        "network":
          "Speech recognition needs a network connection in this browser."
      };

      if (event.error === "no-speech") {
        recordingStatus.textContent =
          "No speech detected yet — keep speaking.";
        return;
      }

      setStatus(
        messages[event.error] ||
        `Speech recognition issue: ${event.error}`,
        "error"
      );
    };

    instance.onend = () => {
      if (recognitionShouldRun && isRecording) {
        try {
          instance.start();
        } catch (error) {
          // Recognition may already be restarting.
        }
      }
    };

    return instance;
  }

  async function startRecording() {
    if (isRecording) {
      return;
    }

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      !window.MediaRecorder
    ) {
      setStatus(
        "Audio recording isn't supported here. Open this page in desktop Chrome or Edge.",
        "error"
      );
      return;
    }

    if (!SpeechRecognition) {
      setStatus(
        "Speech-to-text isn't supported in this browser. Try desktop Chrome. Audio recording may still be available.",
        "error"
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      audioChunks = [];
      audioBlob = null;
      downloadAudioButton.disabled = true;

      const preferredType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : (
              MediaRecorder.isTypeSupported("audio/webm")
                ? "audio/webm"
                : ""
            );

      mediaRecorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, {
          type: mediaRecorder.mimeType || "audio/webm"
        });

        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }

        audioUrl = URL.createObjectURL(audioBlob);
        downloadAudioButton.disabled = audioBlob.size === 0;

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000);

      isRecording = true;
      recognitionShouldRun = Boolean(SpeechRecognition);
      seconds = 0;

      timer.textContent = formatTime(seconds);

      finalTranscript = "";
      interimTranscript = "";

      transcriptPlaceholder.textContent = SpeechRecognition
        ? "Listening... start speaking."
        : "Audio is recording, but live speech-to-text is unavailable in this browser.";

      transcriptTag.textContent = SpeechRecognition
        ? "LISTENING"
        : "AUDIO ONLY";

      startButton.disabled = true;
      stopButton.disabled = false;

      setStatus(
        SpeechRecognition
          ? "Microphone active — speak clearly."
          : "Recording audio — transcription unavailable.",
        "recording"
      );

      timerInterval = setInterval(() => {
        seconds++;
        timer.textContent = formatTime(seconds);
      }, 1000);

      if (SpeechRecognition) {
        recognition = setupRecognition();

        try {
          recognition.start();
        } catch (error) {
          setStatus(
            "Audio is recording, but speech recognition did not start. Try stopping and starting again.",
            "error"
          );
        }
      }
    } catch (error) {
      const message =
        error.name === "NotAllowedError"
          ? "Microphone permission denied. Allow access in the browser address bar, then try again."
          : error.name === "NotFoundError"
            ? "No microphone found. Connect or enable a microphone and try again."
            : "Could not start microphone recording. Check browser permissions and try again.";

      setStatus(message, "error");
    }
  }

  function stopRecording() {
    if (!isRecording) {
      return;
    }

    isRecording = false;
    recognitionShouldRun = false;

    stopTimer();

    if (recognition) {
      recognition.onend = null;

      try {
        recognition.stop();
      } catch (error) {
        // Recognition may already be stopped.
      }

      recognition = null;
    }

    if (
      mediaRecorder &&
      mediaRecorder.state !== "inactive"
    ) {
      mediaRecorder.stop();
    }

    startButton.disabled = false;
    stopButton.disabled = true;

    interimTranscript = "";
    renderTranscript();

    setStatus(
      "Session stopped. You can download your audio and transcript.",
      "stopped"
    );

    if (!finalTranscript.trim()) {
      transcriptPlaceholder.textContent =
        "No transcript was captured. Check microphone permission, speak clearly, and try again.";

      transcriptTag.textContent = "NO TEXT";
      downloadTextButton.disabled = true;
    }
  }

  function downloadText() {
    const text = finalTranscript.trim();

    if (!text) {
      return;
    }

    const blob = new Blob(
      [text + "\n"],
      { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `convolens-transcript-${new Date().toISOString().slice(0, 10)}.txt`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  function downloadAudio() {
    if (!audioBlob || !audioUrl) {
      return;
    }

    const link = document.createElement("a");

    link.href = audioUrl;
    link.download =
      `convolens-recording-${new Date().toISOString().slice(0, 10)}.webm`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  startButton.addEventListener("click", startRecording);
  stopButton.addEventListener("click", stopRecording);

  downloadTextButton.addEventListener(
    "click",
    downloadText
  );

  downloadAudioButton.addEventListener(
    "click",
    downloadAudio
  );

  if (!SpeechRecognition) {
    transcriptPlaceholder.textContent =
      "Your browser may record audio, but live speech-to-text is not supported here. Use desktop Chrome for best results.";
  }
})();
