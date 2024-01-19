import React, { useState, useEffect } from "react";

function Stream({ socket }) {
  // 상태 관리
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const [audioState, setAudioState] = useState(true);
  const [videoState, setVideoState] = useState(true);

  // 미디어 제약 조건 정의
  const mediaConstraints = {
    audio: true,
    video: {
      height: 360,
    },
  };

  // 스트림 시작 함수
  const startStream = () => {
    navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then((stream) => {
        const myVideo = document.getElementById("local_vid");
        myVideo.srcObject = stream;
        setAudioMuteState(!audioState);
        setVideoMuteState(!videoState);
      })
      .catch((error) => {
        console.log(`startStream Error ${error}`);
      });
  };

  // 오디오 음소거 설정 함수
  const setAudioMuteState = (flag) => {
    let muteIcon = document.getElementById("aud_mute_icon");
    if (muteIcon) {
      let localStream = document.getElementById("local_vid").srcObject;
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !flag;
      });

      setAudioState(flag);
    }
  };

  // 비디오 음소거 설정 함수
  const setVideoMuteState = (flag) => {
    let vidMuteIcon = document.getElementById("vid_mute_icon");
    if (vidMuteIcon) {
      let localStream = document.getElementById("local_vid").srcObject;
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !flag;
      });

      setVideoState(flag);
    }
  };

  // 스트림 준비 이벤트 핸들러
  const readyForStream = (event) => {
    event.preventDefault();

    startStream();

    if (roomName.trim() && userName.trim()) {
      socket.emit("readyForStream", roomName, userName);
    }
  };

  useEffect(() => {
    let peerList = [];
    const handleReadyForStreamSuccess = ({ roomName }) => {
      console.log("handleReadyForStreamSuccess", roomName);
      socket.emit("join_room", roomName);
    };

    const handleUserJoin = ({ sid, userName }) => {
      if (sid) {
        console.log(`사용자 참가: ${sid}, ${userName}`);
        let peerId = sid;
        let peerName = userName;
        peerList[peerId] = undefined;
        addVideoElement(peerId, peerName);
      } else {
        console.error("잘못된 데이터 구조 또는 누락된 'sid' 속성");
      }
    };

    // 비디오 엘리먼트 추가 함수
    function addVideoElement(element_id, display_name) {
      const videoElement = makeVideoElementCustom(element_id, display_name);
      document.getElementById("video_grid").appendChild(videoElement);
    }

    // 커스텀 비디오 엘리먼트 생성 함수
    function makeVideoElementCustom(element_id, display_name) {
      let vid = document.createElement("video");
      vid.id = "vid_" + element_id;
      vid.autoplay = true;
      return vid;
    }

    // 소켓 이벤트 리스너 등록
    socket.on("readyForStreamSuccess", handleReadyForStreamSuccess);
    socket.on("user_join", handleUserJoin);

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      socket.off("readyForStreamSuccess", handleReadyForStreamSuccess);
      socket.off("user_join", handleUserJoin);
    };
  }, [socket]);

  // JSX 반환
  return (
    <div>
      {/* 폼 및 입력 필드 */}
      <form onSubmit={readyForStream}>
        <input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
        <input value={userName} onChange={(e) => setUserName(e.target.value)} />
        <button type="submit">Join!</button>
      </form>

      {/* 비디오 그리드 */}
      <div id="video_grid">{/* 비디오 요소가 여기에 추가됩니다 */}</div>

      {/* 로컬 비디오 요소 */}
      <video id="local_vid" autoPlay playsInline />

      {/* 오디오 음소거 버튼 */}
      <button id="aud_mute_icon" onClick={() => setAudioMuteState(!audioState)}>
        {audioState ? "Unmute Audio" : "Mute Audio"}
      </button>

      {/* 비디오 음소거 버튼 */}
      <button id="vid_mute_icon" onClick={() => setVideoMuteState(!videoState)}>
        {videoState ? "unMute Video" : "Mute Video"}
      </button>
    </div>
  );
}

export default Stream;
