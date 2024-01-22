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
  const [userListUpdated, setUserListUpdated] = useState(false);
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
      socket.emit("data", data);
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

  // handleNegotiationNeededEvent 함수 추가
  const handleNegotiationNeededEvent = useCallback(
    (peer_id) => {
      peerList[peer_id]
        .createOffer()
        .then((offer) => peerList[peer_id].setLocalDescription(offer))
        .then(() => {
          console.log(`sending offer to <${peer_id}> ...`);
          sendViaServer({
            sender_id: myID,
            target_id: peer_id,
            type: "offer",
            sdp: peerList[peer_id].localDescription,
          });
        })
        .catch((error) => {
          console.error(`Error creating and sending offer: ${error}`);
        });
    },
    [peerList, sendViaServer, myID]
  );

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
      peerConnection.onnegotiationneeded = () =>
        handleNegotiationNeededEvent(peer_id);
    },
    [
      peerList,
      setPeerList,
      handleICECandidateEvent,
      handleTrackEvent,
      handleNegotiationNeededEvent,
    ]
  );

  // handleOfferMsg 함수 수정
  const handleOfferMsg = useCallback(
    (msg) => {
      const peer_id = msg["sender_id"];

      console.log(`Offer received from <${peer_id}>`);

      createPeerConnection(peer_id);
      let desc = new RTCSessionDescription(msg["sdp"]);
      peerList[peer_id]
        .setRemoteDescription(desc)
        .then(() => {
          let local_stream = myVideo.current.srcObject;
          local_stream
            .getTracks()
            .forEach((track) =>
              peerList[peer_id].addTrack(track, local_stream)
            );
        })
        .then(() => peerList[peer_id].createAnswer())
        .then((answer) => peerList[peer_id].setLocalDescription(answer))
        .then(() => {
          console.log(`Sending answer to <${peer_id}> ...`);
          sendViaServer({
            sender_id: myID,
            target_id: peer_id,
            type: "answer",
            sdp: peerList[peer_id].localDescription,
          });
        })
        .catch((error) => {
          console.log(error);
        });
    },
    [peerList, myID, sendViaServer, createPeerConnection]
  );

  // handleAnswerMsg 함수 수정
  const handleAnswerMsg = useCallback(
    (msg) => {
      const peer_id = msg["sender_id"];
      console.log(`Answer received from <${peer_id}>`);
      let desc = new RTCSessionDescription(msg["sdp"]);
      peerList[peer_id].setRemoteDescription(desc);
    },
    [peerList]
  );

  // handleNewICECandidateMsg 함수 추가
  const handleNewICECandidateMsg = useCallback(
    (msg) => {
      const peer_id = msg["sender_id"];
      console.log(`ICE candidate received from <${peer_id}>`);
      const candidate = new RTCIceCandidate(msg.candidate);
      peerList[peer_id].addIceCandidate(candidate).catch((error) => {
        console.error(`Error adding ICE candidate: ${error}`);
      });
    },
    [peerList]
  );

  // 초대 함수를 useCallback으로 감싸기
  const invite = useCallback(
    async (peerId) => {
      console.log("invite");
      if (peerList[peerId]) {
        console.log(
          "[Not supposed to happen!] Attempting to start a connection that already exists!"
        );
      } else if (peerId === myID) {
        console.log("[Not supposed to happen!] Trying to connect to self!");
      } else {
        console.log(`Creating peer connection for <${peerId}> ...`);
        createPeerConnection(peerId);
        await sleep(2000);
        let local_stream = myVideo.current.srcObject;
        console.log(myVideo.current.srcObject);
        local_stream.getTracks().forEach((track) => {
          peerList[peerId].addTrack(track, local_stream);
        });
        console.log(myVideo.current.srcObject);
      }
    },
    [peerList, myID, createPeerConnection]
  );

  // WebRTC 시작 함수
  const start_webrtc = useCallback(() => {
    console.log("PeerList in start_webrtc:", peerList);
    //PeerList가 비어있으니 for문이 안 돌고 그래서 invite함수를 호출하지 못해 나아가지 못하는 상황
    for (let peerId in peerList) {
      console.log("invite 호출되냐?");
      invite(peerId);
    }
    console.log("start_webrtc");
  }, [peerList, invite]);

  // useEffect를 사용하여 소켓 이벤트 리스너 등록 및 해제
  useEffect(() => {
    const handleReadyForStreamSuccess = ({ roomName }) => {
      console.log("handleReadyForStreamSuccess", roomName);
      socket.emit("join_room", roomName);
    };

    const handleUserJoin = ({ sid, userName }) => {
      if (sid) {
        let peerId = sid;
        let peerName = userName;
        setPeerList((prevPeerList) => {
          return {
            ...prevPeerList,
            [peerId]: undefined, // 또는 새로운 객체를 할당
          };
        });
        console.log(`사용자 참가: ${sid}, ${userName}`);
        addVideoElement(peerId, peerName);
      } else {
        console.error("잘못된 데이터 구조 또는 누락된 'sid' 속성");
      }
    };

    // 비디오 엘리먼트 추가 함수
    function addVideoElement(element_id, display_name) {
      const videoElement = makeVideoElementCustom(element_id, display_name);
      document.getElementById("video_grid").appendChild(videoElement);
      console.log("비디오 엘리먼트 추가 완료");
    }

    // 커스텀 비디오 엘리먼트 생성 함수
    function makeVideoElementCustom(element_id, display_name) {
      let vid = document.createElement("video");
      vid.id = "vid_" + element_id;
      vid.autoplay = true;
      return vid;
    }

    const handleUserList = async ({ my_id, list }) => {
      console.log("user list recv ", my_id);
      await setMyID(my_id); //일단 여기 라인 비동기라서 아래에서 콘솔로그로 확인하면 my_id 업데이트 안되서 null값 나옴
      if (list) {
        //방에 처음으로 연결되지 않은 경우, 기존 사용자 목록 수신
        let recvd_list = list;
        //기존 사용자를 사용자 목록에 추가
        for (let peerId in recvd_list) {
          let peerName = recvd_list[peerId];
          //setPeerList도 비동기인데가 왜 업데이트 안되는 지 모르겠음 아마 비동기에 useEffect섞여서
          //myID랑 같은 문제인듯
          await setPeerList((prevPeerList) => {
            const newPeerList = { ...prevPeerList, [peerId]: undefined };
            console.log(newPeerList);
            return {
              newPeerList,
            };
          });
          setUserListUpdated(true); // 여기에서 상태를 업데이트합니다.
          addVideoElement(peerId, peerName);
        }
      }
    };

    // 소켓 이벤트 리스너 등록
    socket.on("readyForStreamSuccess", handleReadyForStreamSuccess);
    socket.on("user_join", handleUserJoin);
    socket.on("user_list", handleUserList);
    socket.on("data", (msg) => {
      switch (msg["type"]) {
        case "offer":
          handleOfferMsg(msg);
          break;
        case "answer":
          handleAnswerMsg(msg);
          break;
        case "new-ice-candidate":
          handleNewICECandidateMsg(msg);
          break;
        default:
          console.warn("Unknown message type:", msg["type"]);
      }
    });

    // 컴포넌트가 언마운트 될 때 리스너 제거
    return () => {
      socket.off("readyForStreamSuccess", handleReadyForStreamSuccess);
      socket.off("user_join", handleUserJoin);
      socket.off("user_list", handleUserList);
      socket.off("data");
    };
  }, [
    socket,
    start_webrtc,
    invite,
    myID,
    handleOfferMsg,
    handleAnswerMsg,
    handleNewICECandidateMsg,
  ]);

  useEffect(() => {
    if (userListUpdated && myID && Object.keys(peerList).length > 0) {
      start_webrtc();
      setUserListUpdated(false); // start_webrtc 함수가 호출된 후에 상태를 초기화합니다.
    }
  }, [userListUpdated, myID, peerList, start_webrtc]);

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
