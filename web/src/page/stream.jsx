import React, { useState, useEffect, useRef, useCallback } from "react";

// RTC 연결 설정을 담은 상수
const PC_CONFIG = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
      ],
    },
  ],
};

// 비동기 함수 실행을 위한 sleep 함수
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Stream({ socket }) {
  // 로컬 비디오 참조를 위한 useRef
  const myVideo = useRef(null);

  // 컴포넌트의 상태들
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const [audioState, setAudioState] = useState(true);
  const [videoState, setVideoState] = useState(true);
  const [peerList, setPeerList] = useState({});
  const [myID, setMyID] = useState(null);

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
        if (myVideo.current) {
          myVideo.current.srcObject = stream;
        }
        setAudioMuteState(!audioState);
        setVideoMuteState(!videoState);
      })
      .catch((error) => {
        console.log(`startStream 에러 ${error}`);
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

  // 서버를 통해 메시지 전송을 위한 콜백 함수
  const sendViaServer = useCallback(
    (data) => {
      socket.emit("message", data);
    },
    [socket]
  );

  // ICE candidate 이벤트 핸들러
  const handleICECandidateEvent = useCallback(
    (event, peer_id) => {
      if (event.candidate) {
        sendViaServer({
          sender_id: myID,
          target_id: peer_id,
          type: "new-ice-candidate",
          candidate: event.candidate,
        });
      }
    },
    [myID, sendViaServer]
  );

  // Track 이벤트 핸들러 정의
  const handleTrackEvent = useCallback((event, peer_id) => {
    console.log(`track event received from <${peer_id}>`);

    if (event.streams) {
      getVideoObj(peer_id).srcObject = event.streams[0];
    }
  }, []);

  // 비디오 요소 가져오기
  function getVideoObj(element_id) {
    return document.getElementById("vid_" + element_id);
  }

  // peer connection 생성 함수
  const createPeerConnection = useCallback(
    (peer_id) => {
      // 새 RTCPeerConnection을 추가하기 위해 상태 업데이트 함수 사용
      setPeerList((prevPeerList) => ({
        ...prevPeerList,
        [peer_id]: new RTCPeerConnection(PC_CONFIG),
      }));
      // 이벤트 핸들러 설정
      const peerConnection = peerList[peer_id];
      peerConnection.onicecandidate = (event) =>
        handleICECandidateEvent(event, peer_id);
      peerConnection.ontrack = (event) => handleTrackEvent(event, peer_id);
    },
    [peerList, setPeerList, handleICECandidateEvent, handleTrackEvent]
  );

  // 초대 함수를 useCallback으로 감싸기
  const invite = useCallback(
    async (peer_id) => {
      if (peerList[peer_id]) {
        console.log(
          "[Not supposed to happen!] Attempting to start a connection that already exists!"
        );
      } else if (peer_id === myID) {
        console.log("[Not supposed to happen!] Trying to connect to self!");
      } else {
        console.log(`Creating peer connection for <${peer_id}> ...`);
        createPeerConnection(peer_id);
        await sleep(2000);
        let local_stream = myVideo.current.srcObject;
        console.log(myVideo.current.srcObject);
        local_stream.getTracks().forEach((track) => {
          peerList[peer_id].addTrack(track, local_stream);
        });
        console.log(myVideo.current.srcObject);
      }
    },
    [peerList, myID, createPeerConnection]
  );

  // WebRTC 시작 함수
  const start_webrtc = useCallback(() => {
    for (let peer_id in peerList) {
      invite(peer_id);
    }
  }, [peerList, invite]);

  // useEffect를 사용하여 소켓 이벤트 리스너 등록 및 해제
  useEffect(() => {
    const handleReadyForStreamSuccess = ({ roomName }) => {
      console.log("handleReadyForStreamSuccess", roomName);
      socket.emit("join_room", roomName);
    };

    const handleUserJoin = ({ sid, userName }) => {
      if (sid) {
        console.log(`사용자 참가: ${sid}, ${userName}`);
        let peerId = sid;
        let peerName = userName;
        setPeerList((prevPeerList) => {
          return {
            ...prevPeerList,
            [peerId]: undefined, // 또는 새로운 객체를 할당
          };
        });

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

    const handleUserList = ({ data }) => {
      console.log("user list recvd ", data);
      setMyID(data["my_id"]);
      console.log("myid", myID);
      if ("list" in data) {
        // 방에 처음으로 연결되지 않은 경우, 기존 사용자 목록 수신
        let recvd_list = data["list"];
        // 기존 사용자를 사용자 목록에 추가
        for (let peerId in recvd_list) {
          let peerName = recvd_list[peerId];
          setPeerList((prevPeerList) => {
            return {
              ...prevPeerList,
              [peerId]: undefined, // 또는 새로운 객체를 할당
            };
          });

          addVideoElement(peerId, peerName);
        }
        start_webrtc();
      }
    };

    // 소켓 이벤트 리스너 등록
    socket.on("readyForStreamSuccess", handleReadyForStreamSuccess);
    socket.on("user_join", handleUserJoin);
    socket.on("user-list", handleUserList);

    // 컴포넌트가 언마운트 될 때 리스너 제거
    return () => {
      socket.off("readyForStreamSuccess", handleReadyForStreamSuccess);
      socket.off("user_join", handleUserJoin);
    };
  }, [socket, start_webrtc, invite, myID]);

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
      <video id="local_vid" ref={myVideo} autoPlay playsInline />

      {/* 오디오 음소거 버튼 */}
      <button id="aud_mute_icon" onClick={() => setAudioMuteState(!audioState)}>
        {audioState ? "음소거 해제" : "음소거"}
      </button>

      {/* 비디오 음소거 버튼 */}
      <button id="vid_mute_icon" onClick={() => setVideoMuteState(!videoState)}>
        {videoState ? "비디오 해제" : "비디오 음소거"}
      </button>
    </div>
  );
}

export default Stream;
