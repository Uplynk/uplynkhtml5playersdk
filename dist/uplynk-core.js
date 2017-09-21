(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var AdBreak = (function () {
    function AdBreak(segments) {
        if (segments && segments.length > 0) {
            this._segments = segments;
            this.numAds = segments.length;
            this.startTime = segments[0].startTime;
            this.endTime = segments[segments.length - 1].endTime;
            this.duration = this.endTime - this.startTime;
        }
    }
    AdBreak.prototype.getAdPositionAt = function (time) {
        for (var i = 0; i < this._segments.length; i++) {
            if (this._segments[i].startTime <= time && time <= this._segments[i].endTime) {
                return i + 1;
            }
        }
        return 0;
    };
    AdBreak.prototype.getSegmentAt = function (index) {
        if (this._segments && index > -1 && index < this._segments.length) {
            return this._segments[index];
        }
        return undefined;
    };
    AdBreak.prototype.contains = function (time) {
        return this.startTime <= time && time <= this.endTime;
    };
    return AdBreak;
}());
exports.AdBreak = AdBreak;

},{}],2:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var observable_1 = require('./utils/observable');
var asset_info_service_1 = require('./web-services/asset-info-service');
var ping_service_1 = require('./web-services/ping-service');
var id3_handler_1 = require('./id3/id3-handler');
var segment_map_1 = require('./utils/segment-map');
var thumb = require('./utils/thumbnail-helper');
var events_1 = require('./events');
var utils_1 = require('./utils/utils');
var license_manager_1 = require('./license-manager');
var utils_2 = require('./utils/utils');
var AdaptivePlayer = (function (_super) {
    __extends(AdaptivePlayer, _super);
    function AdaptivePlayer(video, options) {
        _super.call(this);
        this._defaults = {
            disableSeekDuringAdBreak: true,
            showPoster: false,
            debug: false,
            limitResolutionToViewSize: false,
        };
        var data = {};
        try {
            data = JSON.parse(video.getAttribute('data-config'));
        }
        catch (e) { }
        this._config = Object.assign({}, this._defaults, options, data);
        this._video = video;
        this._id3Handler = new id3_handler_1.ID3Handler(video);
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.ID3Tag, this._onID3Tag.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TxxxID3Frame, this._onTxxxID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.PrivID3Frame, this._onPrivID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TextID3Frame, this._onTextID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.SliceEntered, this._onSliceEntered.bind(this));
        this._onVideoTimeUpdate = this._onVideoTimeUpdate.bind(this);
        this._onVideoSeeking = this._onVideoSeeking.bind(this);
        this._onVideoSeeked = this._onVideoSeeked.bind(this);
        this._onMediaSourceOpen = this._onMediaSourceOpen.bind(this);
        this._onVideoPlaybackEnd = this._onVideoPlaybackEnd.bind(this);
        this._onTimerTick = this._onTimerTick.bind(this);
        this._isSafari = false;
        this._isIE = false;
        this._isFirefox = false;
        this._isChrome = false;
        this._firedReadyEvent = false;
        this._ended = false;
        this._usingCustomUI = false;
        this._intervalId = 0;
        this._overrideCurrentTime();
        this._overrideEnded();
    }
    AdaptivePlayer.prototype._overrideCurrentTime = function () {
        var currentTimeProperty = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        if (currentTimeProperty) {
            var getCurrentTime = currentTimeProperty.get;
            var setCurrentTime = currentTimeProperty.set;
            var self_1 = this;
            Object.defineProperty(this._video, 'currentTime', {
                get: function () {
                    return getCurrentTime.apply(this);
                },
                set: function (val) {
                    if (self_1.canSeek()) {
                        self_1._ended = false;
                        var actualTime = self_1.getSeekTime(val);
                        setCurrentTime.apply(this, [actualTime]);
                    }
                },
                enumerable: false,
                configurable: false,
            });
        }
    };
    AdaptivePlayer.prototype._overrideEnded = function () {
        var self = this;
        Object.defineProperty(this._video, 'ended', {
            get: function () {
                return self._ended;
            },
            enumerable: false,
            configurable: false,
        });
    };
    Object.defineProperty(AdaptivePlayer, "Event", {
        get: function () {
            return events_1.Events;
        },
        enumerable: true,
        configurable: true
    });
    AdaptivePlayer.prototype.destroy = function () {
        this._stopMainLoop();
        if (typeof this._adaptiveSource != 'undefined') {
            this._adaptiveSource.delete();
            this._adaptiveSource = undefined;
        }
        if (this._objectUrl) {
            window.URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
    };
    AdaptivePlayer.prototype.load = function (url) {
        this._firedReadyEvent = false;
        this._url = url;
        this._targetTime = undefined;
        this._forcedAdBreak = undefined;
        this._ended = false;
        this._mediaSource = new MediaSource();
        if (typeof this._adaptiveSource != 'undefined') {
            this._adaptiveSource.delete();
            this._adaptiveSource = undefined;
        }
        this._video.removeEventListener('timeupdate', this._onVideoTimeUpdate);
        this._video.removeEventListener('seeking', this._onVideoSeeking);
        this._video.removeEventListener('seeked', this._onVideoSeeked);
        this._video.removeEventListener('ended', this._onVideoPlaybackEnd);
        this._video.addEventListener('timeupdate', this._onVideoTimeUpdate);
        this._video.addEventListener('seeking', this._onVideoSeeking);
        this._video.addEventListener('seeked', this._onVideoSeeked);
        this._video.addEventListener('ended', this._onVideoPlaybackEnd);
        this._video.onloadedmetadata = this.updateVideoRect.bind(this);
        this._mediaSource.addEventListener('sourceopen', this._onMediaSourceOpen);
        this._adaptiveSource = new Module.AdaptiveSource();
        this._adaptiveSource.onBeamLoaded(this._onBeamLoaded.bind(this));
        this._adaptiveSource.onTrackLoaded(this._onTrackLoaded.bind(this));
        this._adaptiveSource.onLoaded(this._onSourceLoaded.bind(this));
        this._adaptiveSource.onLoadError(this._onLoadError.bind(this));
        this._adaptiveSource.onDrmError(this._onDrmError.bind(this));
        this._adaptiveSource.onSegmentMapChanged(this._onSegmentMapChanged.bind(this));
        this._adaptiveSource.startMainLoop(this._startMainLoop.bind(this));
        this._adaptiveSource.stopMainLoop(this._stopMainLoop.bind(this));
        this._adaptiveSource.startLicenseRequest(this._startLicenseRequest.bind(this));
        if (utils_1.isLocalStorageAvailable()) {
            this._adaptiveSource.setLoadAndSaveBandwidth(this._loadBandwidthHistory.bind(this), this._saveBandwidthHistory.bind(this));
        }
        if (this._objectUrl) {
            window.URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
        this._objectUrl = window.URL.createObjectURL(this._mediaSource);
        this._video.src = this._objectUrl;
        this._video.load();
    };
    AdaptivePlayer.prototype.canSeek = function () {
        if (this._adaptiveSource === undefined) {
            return false;
        }
        if (this.playlistType === 'LIVE' || this.playlistType === 'EVENT') {
            return true;
        }
        if (!this._usingCustomUI) {
            return true;
        }
        if (!this._config.disableSeekDuringAdBreak) {
            return true;
        }
        if (this._segmentMap === undefined) {
            return false;
        }
        return !this._segmentMap.inAdBreak(this._video.currentTime);
    };
    AdaptivePlayer.prototype.getSeekTime = function (targetTime) {
        if (this.playlistType === 'LIVE' || this.playlistType === 'EVENT') {
            return targetTime;
        }
        if (!this._config.disableSeekDuringAdBreak) {
            return targetTime;
        }
        if (!this._usingCustomUI) {
            return targetTime;
        }
        var currentTime = this._video.currentTime;
        var adBreak = this._segmentMap.getAdBreak(targetTime);
        if (adBreak) {
            return adBreak.startTime;
        }
        var adBreaks = this._segmentMap.getAdBreaksBetween(currentTime, targetTime);
        if (adBreaks && adBreaks.length > 0) {
            this._targetTime = targetTime;
            this._forcedAdBreak = adBreaks[adBreaks.length - 1];
            return this._forcedAdBreak.startTime;
        }
        return targetTime;
    };
    AdaptivePlayer.prototype.setBrowser = function (safari, ie, chrome, firefox) {
        this._isSafari = safari;
        this._isIE = ie;
        this._isFirefox = firefox;
        this._isChrome = chrome;
        this._usingCustomUI = true;
    };
    AdaptivePlayer.prototype._onVideoTimeUpdate = function () {
        if (this._adaptiveSource && this._video) {
            if (this._forcedAdBreak && this._video.currentTime > this._forcedAdBreak.endTime) {
                var targetTime = this._targetTime;
                this._targetTime = undefined;
                this._forcedAdBreak = undefined;
                this._video.currentTime = targetTime;
            }
            if (this._adaptiveSource && this._video && !this._video.seeking) {
                this._adaptiveSource.onTimeUpdate();
            }
            if (this.playlistType === 'VOD' && !this._ended && this._video.duration - this._video.currentTime <= 0.25) {
                this._ended = true;
                var event = new CustomEvent('ended');
                this._video.dispatchEvent(event);
                this._video.pause();
            }
            this.updateVideoRect();
        }
    };
    AdaptivePlayer.prototype._onVideoSeeking = function () {
        if (this._isSafari && !(this.playlistType == "EVENT" || this.playlistType == "LIVE")) {
            this._isPaused = this._video.paused;
            this._video.pause();
        }
        this._adaptiveSource.seek(this._video.currentTime);
    };
    AdaptivePlayer.prototype._onVideoSeeked = function () {
        if (this._isSafari && !this._isPaused && !(this.playlistType == "EVENT" || this.playlistType == "LIVE")) {
            this._video.play();
        }
    };
    AdaptivePlayer.prototype._onVideoPlaybackEnd = function () {
        this._adaptiveSource.videoPlaybackEnd();
    };
    AdaptivePlayer.prototype._onMediaSourceOpen = function () {
        this._adaptiveSource.initializeVideoElement(this._video, this._mediaSource, this._config.debug);
        this._adaptiveSource.load(this._url);
    };
    AdaptivePlayer.prototype._onID3Tag = function (event) {
        _super.prototype.fire.call(this, events_1.Events.ID3Tag, event);
    };
    AdaptivePlayer.prototype._onTxxxID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TxxxID3Frame, event);
    };
    AdaptivePlayer.prototype._onPrivID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.PrivID3Frame, event);
    };
    AdaptivePlayer.prototype._onTextID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TextID3Frame, event);
    };
    AdaptivePlayer.prototype._onSliceEntered = function (event) {
        _super.prototype.fire.call(this, events_1.Events.SliceEntered, event);
    };
    AdaptivePlayer.prototype._onBeamLoaded = function () {
        var _this = this;
        this._assetInfoService = new asset_info_service_1.AssetInfoService(this._adaptiveSource.domain, this._adaptiveSource.sessionId);
        this._pingService = new ping_service_1.PingService(this._adaptiveSource.domain, this._adaptiveSource.sessionId, this._video);
        this._video.textTracks.addEventListener('change', function (changeTrackEvent) {
            _this.onTextTrackChanged(changeTrackEvent);
        });
        _super.prototype.fire.call(this, events_1.Events.BeamLoaded);
    };
    AdaptivePlayer.prototype._onTrackLoaded = function () {
        _super.prototype.fire.call(this, events_1.Events.TrackLoaded);
        if (!this._firedReadyEvent) {
            this._firedReadyEvent = true;
            _super.prototype.fire.call(this, events_1.Events.Ready);
        }
    };
    AdaptivePlayer.prototype._startMainLoop = function () {
        if (this._intervalId === 0) {
            this._intervalId = setInterval(this._onTimerTick, 15);
        }
    };
    AdaptivePlayer.prototype._stopMainLoop = function () {
        if (this._intervalId !== 0) {
            clearInterval(this._intervalId);
            this._intervalId = 0;
        }
    };
    AdaptivePlayer.prototype._onTimerTick = function () {
        this._adaptiveSource.onTick();
    };
    AdaptivePlayer.prototype._isUplynkUrl = function (url) {
        var temp = url.toLowerCase();
        return temp.indexOf('uplynk.com') > -1 || temp.indexOf('downlynk.com') > -1;
    };
    AdaptivePlayer.prototype._onSourceLoaded = function () {
        var _this = this;
        if (!this._isUplynkUrl(this._url)) {
            this._adaptiveSource.start();
            _super.prototype.fire.call(this, events_1.Events.SourceLoaded);
        }
        else {
            this._assetInfoService.loadSegmentMap(this._segmentMap, function () {
                _this._adaptiveSource.start();
                _super.prototype.fire.call(_this, events_1.Events.SourceLoaded);
                if (_this._config.showPoster && _this.playlistType == "VOD") {
                    var contentSegment = _this._segmentMap.contentSegments[0];
                    var contentAsset = _this._assetInfoService.getAssetInfo(contentSegment.id);
                    _this._video.poster = contentAsset.posterUrl;
                }
            });
        }
    };
    AdaptivePlayer.prototype._onLoadError = function (message, code) {
        _super.prototype.fire.call(this, events_1.Events.LoadError, { error: message, code: code });
    };
    AdaptivePlayer.prototype._onDrmError = function (message) {
        _super.prototype.fire.call(this, events_1.Events.DrmError, { error: message });
    };
    AdaptivePlayer.prototype._onSegmentMapChanged = function () {
        if (this.playlistType === "VOD") {
            if (!this._segmentMap) {
                this._segmentMap = new segment_map_1.SegmentMap(this._adaptiveSource.segmentMap);
                this._initSegmentTextTrack();
                this._initAdBreakTextTrack();
                _super.prototype.fire.call(this, events_1.Events.SegmentMapLoaded, { segmentMap: this._segmentMap });
                _super.prototype.fire.call(this, events_1.Events.LoadedAdBreaks, { adBreaks: this._segmentMap.adBreaks });
            }
        }
        else {
            this._segmentMap = new segment_map_1.SegmentMap(this._adaptiveSource.segmentMap);
            _super.prototype.fire.call(this, events_1.Events.SegmentMapLoaded, { segmentMap: this._segmentMap });
        }
    };
    AdaptivePlayer.prototype._startLicenseRequest = function () {
        if (this._licenseManager === undefined) {
            this._licenseManager = new license_manager_1.LicenseManager(this._video);
        }
        this._licenseManager.setKeyServerPrefix(this._adaptiveSource.keyServerPrefix);
        this._licenseManager.addLicenseRequest(utils_2.base64ToBuffer(this._adaptiveSource.pssh));
    };
    AdaptivePlayer.prototype._loadBandwidthHistory = function () {
        var historyVersion = parseInt(localStorage.getItem("UplynkHistoryVersion"), 10) || 0;
        if (historyVersion < 2 && localStorage.getItem("UplynkHistory") != null) {
            console.log("[adaptive-player.ts] _loadBandwidthHistory found an older history version. Removing it");
            localStorage.removeItem("UplynkHistory");
            localStorage.removeItem("UplynkHistoryTimestamp");
            return null;
        }
        var timestampStr = localStorage.getItem("UplynkHistoryTimestamp");
        var timestamp = parseInt(timestampStr, 10) || 0;
        var now = Date.now();
        var MAX_AGE = 60 * 60 * 1000;
        if (now - timestamp < MAX_AGE) {
            var history_1 = localStorage.getItem("UplynkHistory");
            return JSON.parse(history_1);
        }
        return null;
    };
    AdaptivePlayer.prototype._saveBandwidthHistory = function (history) {
        if (history == null)
            return;
        var timestamp = Date.now();
        localStorage.setItem("UplynkHistoryVersion", "2");
        localStorage.setItem("UplynkHistoryTimestamp", timestamp.toString());
        localStorage.setItem("UplynkHistory", JSON.stringify(history));
    };
    AdaptivePlayer.prototype.getThumbnail = function (time, size) {
        if (size === void 0) { size = "small"; }
        return thumb.getThumbnail(time, this._segmentMap, this._assetInfoService, size);
    };
    AdaptivePlayer.prototype._initSegmentTextTrack = function () {
        var _this = this;
        if (typeof VTTCue === 'undefined') {
            return;
        }
        var segmentTextTrack = this._getOrCreateTextTrack("metadata", "segments");
        var _loop_1 = function(i) {
            var segment = this_1._segmentMap.getSegmentAt(i);
            var cue = new VTTCue(segment.startTime, segment.endTime, segment.id);
            if (cue !== undefined) {
                cue.addEventListener("enter", function () {
                    _this._assetInfoService.loadSegment(segment, function (assetInfo) {
                        _super.prototype.fire.call(_this, events_1.Events.AssetEntered, { segment: segment, asset: assetInfo });
                    });
                });
                cue.addEventListener("exit", function () {
                    _this._assetInfoService.loadSegment(segment, function (assetInfo) {
                        _super.prototype.fire.call(_this, events_1.Events.AssetExited, { segment: segment, asset: assetInfo });
                    });
                });
                segmentTextTrack.addCue(cue);
            }
        };
        var this_1 = this;
        for (var i = 0; i < this._segmentMap.length; i++) {
            _loop_1(i);
        }
    };
    AdaptivePlayer.prototype._initAdBreakTextTrack = function () {
        var _this = this;
        if (typeof VTTCue === 'undefined') {
            return;
        }
        var adBreaks = this._segmentMap.adBreaks;
        if (adBreaks.length === 0) {
            return;
        }
        var track = this._getOrCreateTextTrack("metadata", "adbreaks");
        var _loop_2 = function(i) {
            var adBreak = adBreaks[i];
            var cue = new VTTCue(adBreak.startTime, adBreak.endTime, "adbreak");
            if (cue !== undefined) {
                cue.addEventListener("enter", function () {
                    _super.prototype.fire.call(_this, events_1.Events.AdBreakEntered, { adBreak: adBreak });
                });
                cue.addEventListener("exit", function () {
                    _super.prototype.fire.call(_this, events_1.Events.AdBreakExited, { adBreak: adBreak });
                });
                track.addCue(cue);
            }
        };
        for (var i = 0; i < adBreaks.length; i++) {
            _loop_2(i);
        }
        if (this._isFirefox && !this._video.autoplay && adBreaks[0].startTime === 0 && this._video.currentTime === 0) {
            _super.prototype.fire.call(this, events_1.Events.AdBreakEntered, { adBreak: adBreaks[0] });
        }
    };
    AdaptivePlayer.prototype._getOrCreateTextTrack = function (kind, label) {
        for (var i = 0; i < this._video.textTracks.length; i++) {
            var track = this._video.textTracks[i];
            if (track.kind === kind && track.label === label) {
                return track;
            }
        }
        return this._video.addTextTrack(kind, label);
    };
    AdaptivePlayer.prototype.onTextTrackChanged = function (changeTrackEvent) {
        this._adaptiveSource.onTextTrackChanged(changeTrackEvent);
    };
    AdaptivePlayer.prototype.updateVideoRect = function () {
        var currentVideoRect = this._video.getBoundingClientRect();
        if ((!this._videoRect) || (this._videoRect.width != currentVideoRect.width || this._videoRect.height != currentVideoRect.height)) {
            this._videoRect = currentVideoRect;
            if (this._adaptiveSource && this._config.limitResolutionToViewSize) {
                this._adaptiveSource.setMaxVideoResolution(currentVideoRect.height, currentVideoRect.width);
            }
        }
    };
    Object.defineProperty(AdaptivePlayer.prototype, "audioTracks", {
        get: function () {
            return this._adaptiveSource.audioTracks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "audioTrackId", {
        get: function () {
            return this._adaptiveSource.audioTrackId;
        },
        set: function (id) {
            this._adaptiveSource.audioTrackId = id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "domain", {
        get: function () {
            return this._adaptiveSource.domain;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "sessionId", {
        get: function () {
            return this._adaptiveSource.sessionId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "numberOfRays", {
        get: function () {
            return this._adaptiveSource.numberOfRays;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "availableBandwidths", {
        get: function () {
            return this._adaptiveSource.availableBandwidths;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "availableResolutions", {
        get: function () {
            return this._adaptiveSource.availableResolutions;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "availableMimeTypes", {
        get: function () {
            return this._adaptiveSource.availableMimeTypes;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "segmentMap", {
        get: function () {
            return this._segmentMap;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "adBreaks", {
        get: function () {
            return this._segmentMap.adBreaks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "duration", {
        get: function () {
            return this._adaptiveSource ? this._adaptiveSource.duration : 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "playlistType", {
        get: function () {
            return this._adaptiveSource.playlistType;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "supportsThumbnails", {
        get: function () {
            return this.availableResolutions.length > 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "className", {
        get: function () {
            return 'AdaptivePlayer';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "version", {
        get: function () {
            return '02.00.17092100';
        },
        enumerable: true,
        configurable: true
    });
    return AdaptivePlayer;
}(observable_1.Observable));
exports.AdaptivePlayer = AdaptivePlayer;

},{"./events":3,"./id3/id3-handler":5,"./license-manager":6,"./utils/observable":12,"./utils/segment-map":13,"./utils/thumbnail-helper":15,"./utils/utils":16,"./web-services/asset-info-service":17,"./web-services/ping-service":18}],3:[function(require,module,exports){
"use strict";
exports.Events = {
    BeamLoaded: 'beamloaded',
    TrackLoaded: 'trackloaded',
    SourceLoaded: 'sourceloaded',
    LoadError: 'loaderror',
    DrmError: 'drmerror',
    SegmentMapLoaded: 'segmentmapLoaded',
    LoadedAdBreaks: 'loadedadbreaks',
    ID3Tag: 'id3Tag',
    TxxxID3Frame: 'txxxId3Frame',
    PrivID3Frame: 'privId3Frame',
    TextID3Frame: 'textId3Frame',
    SliceEntered: 'sliceEntered',
    AssetEntered: 'assetentered',
    AssetExited: 'assetexited',
    AdBreakEntered: 'adbreakentered',
    AdBreakExited: 'adbreakexited',
    Ready: 'ready'
};

},{}],4:[function(require,module,exports){
"use strict";
var utils_1 = require('../utils/utils');
var ID3Decoder = (function () {
    function ID3Decoder() {
    }
    ID3Decoder.getFrame = function (buffer) {
        if (buffer.length < 21) {
            return undefined;
        }
        if (buffer[0] === 73 &&
            buffer[1] === 68 &&
            buffer[2] === 51) {
            var frameType = String.fromCharCode(buffer[10], buffer[11], buffer[12], buffer[13]);
            var size = 0;
            size = (buffer[14] << 24);
            size |= (buffer[15] << 16);
            size |= (buffer[16] << 8);
            size |= buffer[17];
            var data = utils_1.slice(buffer, 20);
            return { type: frameType, size: size, data: data };
        }
        return undefined;
    };
    ID3Decoder.decodeTextFrame = function (id3Frame) {
        if (id3Frame.size < 2) {
            return undefined;
        }
        if (id3Frame.data[0] !== 3) {
            return undefined;
        }
        var data = utils_1.slice(id3Frame.data, 1);
        return { value: ID3Decoder.utf8ArrayToStr(data) };
    };
    ID3Decoder.decodeTxxxFrame = function (id3Frame) {
        if (id3Frame.size < 2) {
            return undefined;
        }
        if (id3Frame.data[0] !== 3) {
            return undefined;
        }
        var index = 1;
        var description = ID3Decoder.utf8ArrayToStr(utils_1.slice(id3Frame.data, index));
        index += description.length + 1;
        var value = ID3Decoder.utf8ArrayToStr(utils_1.slice(id3Frame.data, index));
        return { description: description, value: value };
    };
    ID3Decoder.decodePrivFrame = function (id3Frame) {
        if (id3Frame.size < 2) {
            return undefined;
        }
        var nullIndex = 0;
        for (var i = 0; i < id3Frame.data.length; i++) {
            if (id3Frame.data[i] === 0) {
                nullIndex = i;
                break;
            }
        }
        var owner = String.fromCharCode.apply(null, utils_1.slice(id3Frame.data, 0, nullIndex));
        var privateData = utils_1.slice(id3Frame.data, nullIndex + 1);
        return { owner: owner, data: privateData };
    };
    ID3Decoder.utf8ArrayToStr = function (array) {
        var char2;
        var char3;
        var out = "";
        var i = 0;
        var length = array.length;
        while (i < length) {
            var c = array[i++];
            switch (c >> 4) {
                case 0:
                    return out;
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                    out += String.fromCharCode(c);
                    break;
                case 12:
                case 13:
                    char2 = array[i++];
                    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                    break;
                case 14:
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }
        return out;
    };
    return ID3Decoder;
}());
exports.ID3Decoder = ID3Decoder;

},{"../utils/utils":16}],5:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var observable_1 = require('../utils/observable');
var id3_decoder_1 = require('./id3-decoder');
var utils_1 = require('../utils/utils');
var ID3Handler = (function (_super) {
    __extends(ID3Handler, _super);
    function ID3Handler(video) {
        _super.call(this);
        video.textTracks.addEventListener('addtrack', this._onAddTrack.bind(this));
    }
    ID3Handler.prototype._onAddTrack = function (addTrackEvent) {
        var track = addTrackEvent.track;
        if (this._isId3MetadataTrack(track)) {
            track.mode = 'hidden';
            track.addEventListener('cuechange', this._onID3CueChange.bind(this));
        }
    };
    ID3Handler.prototype._isId3MetadataTrack = function (track) {
        if (track.kind == "metadata" && track.label == "ID3") {
            return true;
        }
        if (track.kind == "metadata" && track.inBandMetadataTrackDispatchType) {
            var dispatchType = track.inBandMetadataTrackDispatchType;
            return dispatchType === "com.apple.streaming" || dispatchType === "15260DFFFF49443320FF49443320000F";
        }
        return false;
    };
    ID3Handler.prototype._onID3CueChange = function (cueChangeEvent) {
        var _this = this;
        var track = cueChangeEvent.target;
        for (var i = 0; i < track.activeCues.length; i++) {
            var cue = track.activeCues[i];
            if (!cue.onenter) {
                this._onID3Cue(cue);
            }
        }
        for (var i = 0; i < track.cues.length; i++) {
            var cue = track.cues[i];
            if (!cue.onenter) {
                cue.onenter = function (cueEvent) { _this._onID3Cue(cueEvent.target); };
            }
        }
    };
    ID3Handler.prototype._onID3Cue = function (cue) {
        var data = undefined;
        var id3Frame = undefined;
        var txxxFrame = undefined;
        var textFrame = undefined;
        var privFrame = undefined;
        if (cue.data) {
            data = new Uint8Array(cue.data);
        }
        else if (cue.value && cue.value.key && cue.value.data) {
            if (cue.value.key === 'TXXX') {
                var txxxCue = cue.value;
                txxxFrame = { value: txxxCue.data, description: undefined };
            }
            else if (cue.value.key === 'PRIV') {
                var privCue = cue.value;
                privFrame = { owner: privCue.info, data: new Uint8Array(privCue.data) };
            }
        }
        else {
            data = utils_1.base64ToBuffer(cue.text);
        }
        if (data) {
            id3Frame = id3_decoder_1.ID3Decoder.getFrame(data);
            if (id3Frame) {
                if (id3Frame.type === 'TXXX') {
                    txxxFrame = id3_decoder_1.ID3Decoder.decodeTxxxFrame(id3Frame);
                }
                else if (id3Frame.type === 'PRIV') {
                    privFrame = id3_decoder_1.ID3Decoder.decodePrivFrame(id3Frame);
                }
                else if (id3Frame.type[0] === 'T') {
                    textFrame = id3_decoder_1.ID3Decoder.decodeTextFrame(id3Frame);
                }
            }
        }
        if (id3Frame) {
            var event_1 = { cue: cue, frame: id3Frame };
            _super.prototype.fire.call(this, ID3Handler.Event.ID3Tag, event_1);
        }
        if (txxxFrame) {
            var txxxEvent = { cue: cue, frame: txxxFrame };
            _super.prototype.fire.call(this, ID3Handler.Event.TxxxID3Frame, txxxEvent);
            if (txxxFrame.value) {
                var sliceData = txxxFrame.value.split('_');
                if (sliceData.length == 3) {
                    var sliceEvent = { cue: cue, assetId: sliceData[0], rayChar: sliceData[1], sliceIndex: parseInt(sliceData[2], 16) };
                    _super.prototype.fire.call(this, ID3Handler.Event.SliceEntered, sliceEvent);
                }
            }
        }
        else if (privFrame) {
            var privEvent = { cue: cue, frame: privFrame };
            _super.prototype.fire.call(this, ID3Handler.Event.PrivID3Frame, privEvent);
        }
        else if (textFrame) {
            var textEvent = { cue: cue, frame: textFrame };
            _super.prototype.fire.call(this, ID3Handler.Event.TextID3Frame, textEvent);
        }
    };
    Object.defineProperty(ID3Handler, "Event", {
        get: function () {
            return {
                ID3Tag: 'id3Tag',
                TxxxID3Frame: 'txxxId3Frame',
                PrivID3Frame: 'privId3Frame',
                TextID3Frame: 'textId3Frame',
                SliceEntered: 'sliceEntered'
            };
        },
        enumerable: true,
        configurable: true
    });
    return ID3Handler;
}(observable_1.Observable));
exports.ID3Handler = ID3Handler;

},{"../utils/observable":12,"../utils/utils":16,"./id3-decoder":4}],6:[function(require,module,exports){
"use strict";
var LicenseManager = (function () {
    function LicenseManager(video) {
        this.LICENSE_TYPE_NONE = 0;
        this.LICENSE_TYPE_WIDEVINE = 1;
        this.LICENSE_TYPE_PLAYREADY = 2;
        this._licenseType = 0;
        this.playReadyKeySystem = {
            keySystem: 'com.microsoft.playready',
            supportedConfig: [
                {
                    initDataTypes: ['keyids', 'cenc'],
                    audioCapabilities: [
                        {
                            contentType: 'audio/mp4; codecs="mp4a"',
                            robustness: ''
                        }
                    ],
                    videoCapabilities: [
                        {
                            contentType: 'video/mp4; codecs="avc1"',
                            robustness: ''
                        }
                    ]
                }
            ]
        };
        this.widevineKeySystem = {
            keySystem: 'com.widevine.alpha',
            supportedConfig: [
                {
                    label: 'foo',
                    initDataTypes: ['cenc'],
                    sessionTypes: ['temporary'],
                    audioCapabilities: [
                        { contentType: 'audio/mp4; codecs="mp4a.40.5"', robustness: 'SW_SECURE_CRYPTO' }
                    ],
                    videoCapabilities: [
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'HW_SECURE_DECODE' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'HW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'SW_SECURE_DECODE' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.4d001e"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.4d001e"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.4d0016"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.4d0016"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.42000d"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.42000d"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.42000c"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.42000c"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.42000b"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.42000b"', robustness: 'SW_SECURE_CRYPTO' },
                    ]
                }
            ]
        };
        this._video = video;
        this._keyServerPrefix = null;
        this._pssh = null;
        this._mediaKeys = null;
        this._pendingKeyRequests = [];
        this.initMediaKeys();
    }
    LicenseManager.prototype.addLicenseRequest = function (psshData) {
        console.log("LicenseManager - Requesting license for DRM playback");
        this._pendingKeyRequests.push({ initDataType: 'cenc', initData: psshData });
        this.processPendingKeys(this);
    };
    LicenseManager.prototype.setKeyServerPrefix = function (keyServerPrefix) {
        this._keyServerPrefix = keyServerPrefix;
    };
    LicenseManager.prototype.initMediaKeys = function () {
        var self = this;
        this._mediaKeys = null;
        navigator.requestMediaKeySystemAccess(self.widevineKeySystem.keySystem, self.widevineKeySystem.supportedConfig)
            .then(function (keySystemAccess) {
            self._licenseType = self.LICENSE_TYPE_WIDEVINE;
            keySystemAccess.createMediaKeys()
                .then(function (createdMediaKeys) {
                self.onMediaKeyAcquired(self, createdMediaKeys);
            }, function (e) {
                console.log('LicenseManager - createMediaKeys() failed for WideVine');
            });
        }, function () { console.log('LicenseManager - Your browser/system does not support the requested configurations for playing WideVine protected content.'); });
    };
    LicenseManager.prototype.onMediaKeyAcquired = function (self, createdMediaKeys) {
        self._mediaKeys = createdMediaKeys;
        self._video.setMediaKeys(self._mediaKeys);
        self.processPendingKeys(self);
    };
    LicenseManager.prototype.processPendingKeys = function (self) {
        if (self._mediaKeys === null) {
            return;
        }
        while (self._pendingKeyRequests.length > 0) {
            var data = self._pendingKeyRequests.shift();
            self.getNewKeySession(data.initDataType, data.initData);
        }
    };
    LicenseManager.prototype.getNewKeySession = function (initDataType, initData) {
        var self = this;
        var keySession = self._mediaKeys.createSession("temporary");
        keySession.addEventListener('message', function (event) {
            self.downloadNewKey(self.getLicenseUrl(), event.message, function (data) {
                var prom = event.target.update(data);
                prom.catch(function (e) {
                    console.log('LicenseManager - call to MediaKeySession.update() failed' + e);
                });
                console.log("LicenseManager - finished license update for DRM playback");
            });
        }, false);
        var reqPromise = keySession.generateRequest(initDataType, initData);
        reqPromise.catch(function (e) {
            console.log('LicenseManager - keySession.generateRequest() failed: ' + e);
        });
    };
    LicenseManager.prototype.getLicenseUrl = function () {
        if (this._licenseType === this.LICENSE_TYPE_PLAYREADY) {
            return this._keyServerPrefix + "/pr";
        }
        else if (this._licenseType === this.LICENSE_TYPE_WIDEVINE) {
            return this._keyServerPrefix + "/wv";
        }
        return '';
    };
    LicenseManager.prototype.downloadNewKey = function (url, keyMessage, callback) {
        var challenge;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.withCredentials = true;
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    callback(xhr.response);
                }
                else {
                    throw 'LicenseManager - XHR failed (' + url + '). Status: ' + xhr.status + ' (' + xhr.statusText + ')';
                }
            }
        };
        if (this._licenseType === this.LICENSE_TYPE_PLAYREADY) {
        }
        else if (this._licenseType === this.LICENSE_TYPE_WIDEVINE) {
            challenge = keyMessage;
        }
        xhr.send(challenge);
    };
    return LicenseManager;
}());
exports.LicenseManager = LicenseManager;

},{}],7:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var observable_1 = require('./utils/observable');
var events_1 = require('./events');
var ad_break_1 = require('./ad/ad-break');
var id3_handler_1 = require('./id3/id3-handler');
var asset_info_service_1 = require('./web-services/asset-info-service');
var ping_service_1 = require('./web-services/ping-service');
var NativePlayer = (function (_super) {
    __extends(NativePlayer, _super);
    function NativePlayer(video, options) {
        _super.call(this);
        this._defaults = {
            disableSeekDuringAdBreak: true,
            showPoster: false,
            debug: false
        };
        var data = {};
        try {
            data = JSON.parse(video.getAttribute('data-config'));
        }
        catch (e) { }
        this._config = Object.assign({}, this._defaults, options, data);
        this._video = video;
        this._id3Handler = new id3_handler_1.ID3Handler(video);
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.ID3Tag, this._onID3Tag.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TxxxID3Frame, this._onTxxxID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.PrivID3Frame, this._onPrivID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TextID3Frame, this._onTextID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.SliceEntered, this._onSliceEntered.bind(this));
        this._onDurationChange = this._onDurationChange.bind(this);
        this._overrideCurrentTime();
    }
    NativePlayer.prototype.load = function (url) {
        this._firedReadyEvent = false;
        this._currentAssetId = null;
        this._video.removeEventListener('durationchange', this._onDurationChange);
        this._video.addEventListener('durationchange', this._onDurationChange);
        this._sessionId = this._getSessionId(url);
        this._domain = this._getDomain(url);
        this._assetInfoService = new asset_info_service_1.AssetInfoService(this.domain);
        if (this._domain !== 'content.uplynk.com') {
            this._pingService = new ping_service_1.PingService(this.domain, this._sessionId, this._video);
        }
        this._url = url;
        this._video.src = url;
        this._video.load();
    };
    NativePlayer.prototype.destroy = function () {
        this._video.src = null;
    };
    NativePlayer.prototype._overrideCurrentTime = function () {
        var currentTimeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        if (currentTimeDescriptor) {
            var getCurrentTime_1 = currentTimeDescriptor.get;
            var setCurrentTime_1 = currentTimeDescriptor.set;
            var self_1 = this;
            Object.defineProperty(this._video, 'currentTime', {
                get: function () {
                    return getCurrentTime_1.apply(this);
                },
                set: function (val) {
                    if (self_1.canSeek()) {
                        setCurrentTime_1.apply(this, [val]);
                    }
                },
                enumerable: false,
                configurable: false,
            });
        }
    };
    NativePlayer.prototype.canSeek = function () {
        if (!this._config.disableSeekDuringAdBreak) {
            return true;
        }
        return !this._inAdBreak;
    };
    NativePlayer.prototype._getSessionId = function (url) {
        var match = RegExp('[?&]pbs=([^&]*)').exec(url);
        return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
    };
    NativePlayer.prototype._getDomain = function (url) {
        var link = document.createElement('a');
        link.setAttribute('href', url);
        return link.hostname;
    };
    NativePlayer.prototype._onDurationChange = function () {
        if (this._video.duration === Infinity) {
            this._playlistType = 'LIVE';
        }
        else {
            this._playlistType = 'VOD';
        }
        if (!this._firedReadyEvent) {
            this._firedReadyEvent = true;
            _super.prototype.fire.call(this, events_1.Events.Ready);
        }
    };
    Object.defineProperty(NativePlayer, "Event", {
        get: function () {
            return events_1.Events;
        },
        enumerable: true,
        configurable: true
    });
    NativePlayer.prototype.setBrowser = function (safari, ie, chrome, firefox) {
    };
    NativePlayer.prototype.getThumbnail = function (time, size) {
        return null;
    };
    Object.defineProperty(NativePlayer.prototype, "domain", {
        get: function () {
            return this._domain;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "sessionId", {
        get: function () {
            return this._sessionId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "playlistType", {
        get: function () {
            return this._playlistType;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "duration", {
        get: function () {
            return this._video.duration;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "supportsThumbnails", {
        get: function () {
            return false;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "className", {
        get: function () {
            return 'NativePlayer';
        },
        enumerable: true,
        configurable: true
    });
    NativePlayer.prototype._onID3Tag = function (event) {
        _super.prototype.fire.call(this, events_1.Events.ID3Tag, event);
    };
    NativePlayer.prototype._onTxxxID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TxxxID3Frame, event);
    };
    NativePlayer.prototype._onPrivID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.PrivID3Frame, event);
    };
    NativePlayer.prototype._onTextID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TextID3Frame, event);
    };
    NativePlayer.prototype._onSliceEntered = function (event) {
        var _this = this;
        _super.prototype.fire.call(this, events_1.Events.SliceEntered, event);
        if (this._currentAssetId === null) {
            this._assetInfoService.loadAssetId(event.assetId, null, function (assetInfo) {
                _this._currentAssetId = event.assetId;
                _this._onAssetEncountered(event.cue, assetInfo);
            });
        }
        else if (this._currentAssetId !== event.assetId) {
            this._assetInfoService.loadAssetId(this._currentAssetId, null, function (currentAssetInfo) {
                _this._assetInfoService.loadAssetId(event.assetId, null, function (newAssetInfo) {
                    _this._currentAssetId = event.assetId;
                    _this._onNewAssetEncountered(event.cue, currentAssetInfo, newAssetInfo);
                });
            });
        }
        else {
        }
    };
    NativePlayer.prototype._onAssetEncountered = function (cue, assetInfo) {
        var segment = undefined;
        if (assetInfo.isAd) {
            segment = {
                id: assetInfo.asset,
                index: 0,
                startTime: cue.startTime,
                endTime: cue.startTime + assetInfo.duration,
                type: 'AD'
            };
            var segments = [segment];
            this._currentAdBreak = new ad_break_1.AdBreak(segments);
            this._inAdBreak = true;
            _super.prototype.fire.call(this, events_1.Events.AssetEntered, { segment: segment, asset: assetInfo });
            _super.prototype.fire.call(this, events_1.Events.AdBreakEntered, { adBreak: this._currentAdBreak });
        }
        else {
            this._inAdBreak = false;
            _super.prototype.fire.call(this, events_1.Events.AssetEntered, { segment: undefined, asset: assetInfo });
        }
    };
    NativePlayer.prototype._onNewAssetEncountered = function (cue, previousAsset, newAsset) {
        this._inAdBreak = newAsset.isAd;
        if (previousAsset.isAd && this._currentAdBreak) {
            _super.prototype.fire.call(this, events_1.Events.AssetExited, { segment: this._currentAdBreak.getSegmentAt(0), asset: previousAsset });
            _super.prototype.fire.call(this, events_1.Events.AdBreakExited, { adBreak: this._currentAdBreak });
        }
        else {
            _super.prototype.fire.call(this, events_1.Events.AssetExited, { segment: undefined, asset: previousAsset });
        }
        this._onAssetEncountered(cue, newAsset);
    };
    NativePlayer.prototype.onTextTrackChanged = function (changeTrackEvent) {
    };
    Object.defineProperty(NativePlayer.prototype, "version", {
        get: function () {
            return '02.00.17092100';
        },
        enumerable: true,
        configurable: true
    });
    return NativePlayer;
}(observable_1.Observable));
exports.NativePlayer = NativePlayer;

},{"./ad/ad-break":1,"./events":3,"./id3/id3-handler":5,"./utils/observable":12,"./web-services/asset-info-service":17,"./web-services/ping-service":18}],8:[function(require,module,exports){
if (!Array.prototype.find) {
    Object.defineProperty(Array.prototype, 'find', {
        value: function (predicate) {
            if (this == null) {
                throw new TypeError('"this" is null or not defined');
            }
            var o = Object(this);
            var len = o.length >>> 0;
            if (typeof predicate !== 'function') {
                throw new TypeError('predicate must be a function');
            }
            var thisArg = arguments[1];
            var k = 0;
            while (k < len) {
                var kValue = o[k];
                if (predicate.call(thisArg, kValue, k, o)) {
                    return kValue;
                }
                k++;
            }
            return undefined;
        }
    });
}

},{}],9:[function(require,module,exports){
if (typeof Object.assign != 'function') {
    (function () {
        Object.assign = function (target) {
            'use strict';
            if (target === undefined || target === null) {
                throw new TypeError('Cannot convert undefined or null to object');
            }
            var output = Object(target);
            for (var index = 1; index < arguments.length; index++) {
                var source = arguments[index];
                if (source !== undefined && source !== null) {
                    for (var nextKey in source) {
                        if (source.hasOwnProperty(nextKey)) {
                            output[nextKey] = source[nextKey];
                        }
                    }
                }
            }
            return output;
        };
    })();
}

},{}],10:[function(require,module,exports){
(function () {
    window.VTTCue = window.VTTCue || window.TextTrackCue;
})();

},{}],11:[function(require,module,exports){
"use strict";
require('./polyfill/vtt-cue');
require('./polyfill/object');
require('./polyfill/array');
var adaptive_player_1 = require('./adaptive-player');
var native_player_1 = require('./native-player');
function isNativePlaybackSupported() {
    try {
        var video = document.createElement('video');
        if (video.canPlayType) {
            return video.canPlayType('application/vnd.apple.mpegurl') !== '';
        }
    }
    catch (e) {
        return false;
    }
    return false;
}
function isHtmlPlaybackSupported() {
    if ('MediaSource' in window && MediaSource.isTypeSupported) {
        return MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
    }
    return false;
}
function currentScript() {
    var scripts = document.getElementsByTagName('script');
    if (scripts && scripts.length) {
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src.indexOf('uplynk-core.js') > -1 || scripts[i].src.indexOf('uplynk-core.min.js') > -1) {
                return scripts[i];
            }
        }
    }
    return undefined;
}
var loadedUplynkAdaptive = true;
function loadUplynkAdaptivePlayer(video, options, callback) {
    var url = currentScript().src.substring(0, currentScript().src.lastIndexOf('/') + 1) + 'uplynk-adaptive.js';
    var enableWASM = false;
    if (enableWASM && typeof WebAssembly === 'object') {
        callback(new adaptive_player_1.AdaptivePlayer(video, options));
    }
    else if (!isScriptAlreadyIncluded(url)) {
        loadedUplynkAdaptive = false;
        loadScriptAsync(url, function () {
            loadedUplynkAdaptive = true;
            callback(new adaptive_player_1.AdaptivePlayer(video, options));
        });
    }
    else if (loadedUplynkAdaptive) {
        callback(new adaptive_player_1.AdaptivePlayer(video, options));
    }
    else {
        setTimeout(function () {
            loadUplynkAdaptivePlayer(video, options, callback);
        }, 500);
    }
}
function loadScriptAsync(url, callback) {
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    script.onload = function () {
        callback();
    };
    head.appendChild(script);
}
function isScriptAlreadyIncluded(url) {
    var scripts = document.getElementsByTagName("script");
    if (scripts && scripts.length) {
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src === url) {
                return true;
            }
        }
    }
    return false;
}
function createAdaptivePlayer(video, options, callback) {
    if (options.preferNativePlayback) {
        if (isNativePlaybackSupported()) {
            callback(new native_player_1.NativePlayer(video, options));
            return;
        }
        else if (isHtmlPlaybackSupported()) {
            loadUplynkAdaptivePlayer(video, options, callback);
            return;
        }
    }
    else {
        if (isHtmlPlaybackSupported()) {
            loadUplynkAdaptivePlayer(video, options, callback);
            return;
        }
        else if (isNativePlaybackSupported()) {
            callback(new native_player_1.NativePlayer(video, options));
            return;
        }
    }
    console.warn("no playback mode supported");
    callback(undefined);
}
window.createAdaptivePlayer = createAdaptivePlayer;
window.AdaptivePlayer = adaptive_player_1.AdaptivePlayer;

},{"./adaptive-player":2,"./native-player":7,"./polyfill/array":8,"./polyfill/object":9,"./polyfill/vtt-cue":10}],12:[function(require,module,exports){
"use strict";
var string_map_1 = require('./string-map');
var Observable = (function () {
    function Observable() {
        this._listeners = new string_map_1.StringMap();
    }
    Observable.prototype.on = function (label, callback) {
        this._listeners.has(label) || this._listeners.set(label, []);
        this._listeners.get(label).push(callback);
    };
    Observable.prototype.off = function (label, callback) {
        var _this = this;
        var listeners = this._listeners.get(label);
        var index;
        if (listeners && listeners.length) {
            index = listeners.reduce(function (i, listener, index) {
                return (_this._isFunction(listener) && listener === callback) ? i = index : i;
            }, -1);
            if (index > -1) {
                listeners.splice(index, 1);
                this._listeners.set(label, listeners);
                return true;
            }
        }
        return false;
    };
    Observable.prototype.fire = function (label) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var listeners = this._listeners.get(label);
        if (listeners && listeners.length) {
            listeners.forEach(function (listener) {
                listener.apply(void 0, args);
            });
            return true;
        }
        return false;
    };
    Observable.prototype._isFunction = function (obj) {
        return typeof obj == 'function' || false;
    };
    return Observable;
}());
exports.Observable = Observable;

},{"./string-map":14}],13:[function(require,module,exports){
"use strict";
var ad_break_1 = require('../ad/ad-break');
var SegmentMap = (function () {
    function SegmentMap(segments) {
        this._segments = segments;
        this._adBreaks = [];
        this._initAdbreaks();
    }
    SegmentMap.prototype.findSegment = function (time) {
        var index = this.getSegmentIndexAt(time);
        return this.getSegmentAt(index);
    };
    SegmentMap.prototype.getSegmentAt = function (index) {
        if (index >= 0 && index < this._segments.length) {
            return this._segments[index];
        }
        return undefined;
    };
    SegmentMap.prototype.getSegmentIndexAt = function (time) {
        for (var i = 0; i < this._segments.length; i++) {
            var segment = this._segments[i];
            if (segment.startTime <= time && time <= segment.endTime) {
                return i;
            }
        }
        return -1;
    };
    Object.defineProperty(SegmentMap.prototype, "length", {
        get: function () {
            return this._segments.length;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SegmentMap.prototype, "adBreaks", {
        get: function () {
            return this._adBreaks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SegmentMap.prototype, "contentSegments", {
        get: function () {
            return this._segments.filter(SegmentMap.isContent);
        },
        enumerable: true,
        configurable: true
    });
    SegmentMap.isAd = function (segment) {
        return segment.type === "AD";
    };
    SegmentMap.isContent = function (segment) {
        return segment.type === "CONTENT";
    };
    SegmentMap.prototype._initAdbreaks = function () {
        var ads = [];
        for (var i = 0; i < this._segments.length; i++) {
            while (i < this._segments.length && SegmentMap.isAd(this._segments[i])) {
                ads.push(this._segments[i]);
                i++;
            }
            if (ads.length > 0) {
                this._adBreaks.push(new ad_break_1.AdBreak(ads));
                ads = [];
            }
        }
    };
    SegmentMap.prototype.inAdBreak = function (time) {
        for (var i = 0; i < this._adBreaks.length; i++) {
            var adBreak = this._adBreaks[i];
            if (adBreak.contains(time)) {
                return true;
            }
        }
        return false;
    };
    SegmentMap.prototype.getAdBreak = function (time) {
        return this._adBreaks.find(function (adBreak) {
            return adBreak.contains(time);
        });
    };
    SegmentMap.prototype.getAdBreaksBetween = function (start, end) {
        return this._adBreaks.filter(function (adBreak) {
            return start <= adBreak.startTime && adBreak.endTime <= end;
        });
    };
    return SegmentMap;
}());
exports.SegmentMap = SegmentMap;

},{"../ad/ad-break":1}],14:[function(require,module,exports){
"use strict";
var StringMap = (function () {
    function StringMap() {
        this._map = new Object();
    }
    Object.defineProperty(StringMap.prototype, "size", {
        get: function () {
            return Object.keys(this._map).length;
        },
        enumerable: true,
        configurable: true
    });
    StringMap.prototype.has = function (key) {
        return this._map.hasOwnProperty(key);
    };
    StringMap.prototype.get = function (key) {
        return this._map[key];
    };
    StringMap.prototype.set = function (key, value) {
        this._map[key] = value;
    };
    StringMap.prototype.clear = function () {
        var keys = Object.keys(this._map);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            this._map[key] = null;
            delete this._map[key];
        }
    };
    return StringMap;
}());
exports.StringMap = StringMap;

},{}],15:[function(require,module,exports){
"use strict";
var utils_1 = require('./utils');
function getThumbnail(time, segments, assetInfoService, thumbnailSize) {
    if (thumbnailSize === void 0) { thumbnailSize = "small"; }
    if (isNaN(time) || time < 0) {
        time = 0;
    }
    var segment = segments.findSegment(time);
    if (segment) {
        var asset = assetInfoService.getAssetInfo(segment.id);
        if (asset && asset.thumbs) {
            var sliceNumber = getSliceNumber(time, segment, asset);
            var thumb = getThumb(asset, thumbnailSize);
            return {
                url: getThumbnailUrl(asset, sliceNumber, thumb),
                height: thumb.height,
                width: thumb.width
            };
        }
    }
    return {
        url: '',
        height: 0,
        width: 0
    };
}
exports.getThumbnail = getThumbnail;
function getThumbnailUrl(asset, sliceNumber, thumb) {
    var prefix = asset.thumbPrefix;
    if (asset.storagePartitions && asset.storagePartitions.length) {
        for (var i = 0; i < asset.storagePartitions.length; i++) {
            var partition = asset.storagePartitions[i];
            if (partition.start <= sliceNumber && sliceNumber < partition.end) {
                prefix = partition.url;
                break;
            }
        }
    }
    if (prefix[prefix.length - 1] !== '/') {
        prefix += '/';
    }
    var sliceHexNumber = utils_1.toHexString(sliceNumber);
    return "" + prefix + thumb.prefix + sliceHexNumber + ".jpg";
}
function getThumb(asset, size) {
    var thumb = asset.thumbs[0];
    if (size === "large") {
        thumb = asset.thumbs[asset.thumbs.length - 1];
    }
    return thumb;
}
function getSliceNumber(time, segment, asset) {
    var sliceNumber = Math.ceil((time - segment.startTime) / asset.sliceDuration);
    sliceNumber += segment.index;
    if (sliceNumber > asset.maxSlice) {
        sliceNumber = asset.maxSlice;
    }
    return sliceNumber;
}

},{"./utils":16}],16:[function(require,module,exports){
"use strict";
function toTimeString(time) {
    if (isNaN(time)) {
        time = 0;
    }
    var negative = (time < 0) ? "-" : "";
    time = Math.abs(time);
    var seconds = (time % 60) | 0;
    var minutes = ((time / 60) % 60) | 0;
    var hours = (((time / 60) / 60) % 60) | 0;
    var showHours = hours > 0;
    var hrStr = hours < 10 ? "0" + hours : "" + hours;
    var minStr = minutes < 10 ? "0" + minutes : "" + minutes;
    var secStr = seconds < 10 ? "0" + seconds : "" + seconds;
    if (showHours) {
        return "" + negative + hrStr + ":" + minStr + ":" + secStr;
    }
    else {
        return "" + negative + minStr + ":" + secStr;
    }
}
exports.toTimeString = toTimeString;
function toHexString(number, minLength) {
    if (minLength === void 0) { minLength = 8; }
    var hex = number.toString(16).toUpperCase();
    while (hex.length < minLength) {
        hex = "0" + hex;
    }
    return hex;
}
exports.toHexString = toHexString;
function base64ToBuffer(b64encoded) {
    return new Uint8Array(atob(b64encoded).split("").map(function (c) { return c.charCodeAt(0); }));
}
exports.base64ToBuffer = base64ToBuffer;
function slice(data, start, end) {
    if (data.slice) {
        return data.slice(start, end);
    }
    if (end) {
        return data.subarray(start, end);
    }
    return data.subarray(start);
}
exports.slice = slice;
function isLocalStorageAvailable() {
    if (!('localStorage' in window)) {
        return false;
    }
    try {
        window.localStorage.setItem('___test', 'OK');
        var result = window.localStorage.getItem('___test');
        window.localStorage.removeItem('___test');
        return (result === 'OK');
    }
    catch (e) {
        return false;
    }
}
exports.isLocalStorageAvailable = isLocalStorageAvailable;

},{}],17:[function(require,module,exports){
"use strict";
var segment_map_1 = require('../utils/segment-map');
var string_map_1 = require('../utils/string-map');
var TvRating;
(function (TvRating) {
    TvRating[TvRating["NotAvailable"] = -1] = "NotAvailable";
    TvRating[TvRating["NotApplicable"] = 0] = "NotApplicable";
    TvRating[TvRating["TV_Y"] = 1] = "TV_Y";
    TvRating[TvRating["TV_Y7"] = 2] = "TV_Y7";
    TvRating[TvRating["TV_G"] = 3] = "TV_G";
    TvRating[TvRating["TV_PG"] = 4] = "TV_PG";
    TvRating[TvRating["TV_14"] = 5] = "TV_14";
    TvRating[TvRating["TV_MA"] = 6] = "TV_MA";
    TvRating[TvRating["NotRated"] = 7] = "NotRated";
})(TvRating || (TvRating = {}));
var MovieRating;
(function (MovieRating) {
    MovieRating[MovieRating["NotAvailable"] = -1] = "NotAvailable";
    MovieRating[MovieRating["NotApplicable"] = 0] = "NotApplicable";
    MovieRating[MovieRating["G"] = 1] = "G";
    MovieRating[MovieRating["PG"] = 2] = "PG";
    MovieRating[MovieRating["PG_13"] = 3] = "PG_13";
    MovieRating[MovieRating["R"] = 4] = "R";
    MovieRating[MovieRating["NC_17"] = 5] = "NC_17";
    MovieRating[MovieRating["X"] = 6] = "X";
    MovieRating[MovieRating["NotRated"] = 7] = "NotRated";
})(MovieRating || (MovieRating = {}));
var AssetInfo = (function () {
    function AssetInfo(obj, isAd) {
        this.audioOnly = obj.audio_only == 1;
        this.error = obj.error == 1;
        this.tvRating = obj.tv_rating;
        this.storagePartitions = obj.storage_partitions;
        this.maxSlice = obj.max_slice;
        this.thumbPrefix = obj.thumb_prefix;
        this.adData = obj.ad_data;
        this.sliceDuration = obj.slice_dur;
        this.movieRating = obj.movie_rating;
        this.owner = obj.owner;
        this.rates = obj.rates;
        this.thumbs = obj.thumbs;
        this.posterUrl = obj.poster_url;
        this.duration = obj.duration;
        this.defaultPosterUrl = obj.default_poster_url;
        this.description = obj.desc;
        this.ratingFlags = obj.rating_flags;
        this.externalId = obj.external_id;
        this.asset = obj.asset;
        if (isAd == null) {
            this.isAd = obj.is_ad === 1;
        }
        else {
            this.isAd = isAd;
        }
        if (this.thumbs) {
            this.thumbs.sort(function (left, right) {
                return left.width - right.width;
            });
        }
        if (this.storagePartitions && this.storagePartitions.length) {
            for (var i = 0; i < this.storagePartitions.length; i++) {
                this.storagePartitions[i].end = Math.min(this.storagePartitions[i].end, 9007199254740991);
            }
        }
    }
    return AssetInfo;
}());
exports.AssetInfo = AssetInfo;
var AssetInfoService = (function () {
    function AssetInfoService(domain, sessionId) {
        this._domain = domain;
        this._sessionId = sessionId;
        this._cache = new string_map_1.StringMap();
        this._loadSegments = this._loadSegments.bind(this);
    }
    AssetInfoService.prototype.loadSegmentMap = function (segmentMap, callback) {
        var segments = [];
        for (var i = 0; i < segmentMap.length; i++) {
            var segment = segmentMap.getSegmentAt(i);
            segments.push(segment);
        }
        this._loadSegments(segments, callback);
    };
    AssetInfoService.prototype._loadSegments = function (segments, callback) {
        var _this = this;
        if (segments.length == 0) {
            callback();
            return;
        }
        var segment = segments.shift();
        this.loadSegment(segment, function () {
            _this._loadSegments(segments, callback);
        });
    };
    AssetInfoService.prototype.loadAssetId = function (assetId, isAd, callBack) {
        var _this = this;
        if (this.isLoaded(assetId)) {
            var info = this._cache.get(assetId);
            callBack(info);
            return;
        }
        var url = "//" + this._domain + "/player/assetinfo/" + assetId + ".json";
        if (this._sessionId && this._sessionId != "") {
            url = url + "?pbs=" + this._sessionId;
        }
        var xhr = new XMLHttpRequest();
        xhr.onloadend = function () {
            if (xhr.status == 200) {
                var obj = JSON.parse(xhr.responseText);
                var assetInfo = new AssetInfo(obj, isAd);
                _this._cache.set(assetId, assetInfo);
                callBack(assetInfo);
            }
            else {
                callBack(null);
            }
        };
        xhr.open("GET", url);
        xhr.send();
    };
    AssetInfoService.prototype.loadSegment = function (segment, callBack) {
        var assetId = segment.id;
        var isAd = segment_map_1.SegmentMap.isAd(segment);
        this.loadAssetId(assetId, isAd, callBack);
    };
    AssetInfoService.prototype.isLoaded = function (assetId) {
        return this._cache.has(assetId);
    };
    AssetInfoService.prototype.getAssetInfo = function (assetId) {
        if (this.isLoaded(assetId)) {
            var info = this._cache.get(assetId);
            return info;
        }
        return undefined;
    };
    AssetInfoService.prototype.clear = function () {
        this._cache.clear();
    };
    return AssetInfoService;
}());
exports.AssetInfoService = AssetInfoService;

},{"../utils/segment-map":13,"../utils/string-map":14}],18:[function(require,module,exports){
"use strict";
var PingService = (function () {
    function PingService(domain, sessionId, video) {
        this.START = "start";
        this.SEEK = "seek";
        this._domain = domain;
        this._sessionId = sessionId;
        this._video = video;
        this._pingServer = sessionId != null && sessionId != "";
        this._nextTime = undefined;
        this._sentStartPing = false;
        this._seeking = false;
        this._currentTime = 0.0;
        this._seekFromTime = 0.0;
        this._video = video;
        this._onPlayerPositionChanged = this._onPlayerPositionChanged.bind(this);
        this._onStart = this._onStart.bind(this);
        this._onSeeked = this._onSeeked.bind(this);
        this._onSeeking = this._onSeeking.bind(this);
        if (this._pingServer) {
            this._video.addEventListener('timeupdate', this._onPlayerPositionChanged);
            this._video.addEventListener('playing', this._onStart);
            this._video.addEventListener('seeked', this._onSeeked);
            this._video.addEventListener('seeking', this._onSeeking);
        }
    }
    PingService.prototype._createQueryString = function (event, currentPosition, fromPosition) {
        var VERSION = 3;
        if (event) {
            var str = "v=" + VERSION + "&ev=" + event + "&pt=" + currentPosition;
            if (fromPosition) {
                str += "&ft=" + fromPosition;
            }
            return str;
        }
        return "v=" + VERSION + "&pt=" + currentPosition;
    };
    PingService.prototype._onStart = function () {
        if (this._pingServer && !this._sentStartPing) {
            this._sendPing(this.START, 0);
            this._sentStartPing = true;
        }
    };
    PingService.prototype._onSeeking = function () {
        this._seeking = true;
        this._nextTime = undefined;
        this._seekFromTime = this._currentTime;
    };
    PingService.prototype._onSeeked = function () {
        if (this._pingServer && this._seeking && this._seekFromTime) {
            this._sendPing(this.SEEK, this._currentTime, this._seekFromTime);
            this._seeking = false;
            this._seekFromTime = undefined;
        }
    };
    PingService.prototype._onPlayerPositionChanged = function () {
        this._currentTime = this._video.currentTime;
        if (this._pingServer && !this._seeking && this._nextTime && this._currentTime > this._nextTime) {
            this._nextTime = undefined;
            this._sendPing(null, this._currentTime);
        }
    };
    PingService.prototype._sendPing = function (event, currentPosition, fromPosition) {
        var _this = this;
        var url = "//" + this._domain + "/session/ping/" + this._sessionId + ".json?" + this._createQueryString(event, currentPosition, fromPosition);
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "text";
        xhr.onload = function () {
            if (xhr.status == 200) {
                var json = JSON.parse(xhr.responseText);
                _this._nextTime = json.next_time;
                if (_this._nextTime < 0 || json.hasOwnProperty('error')) {
                    _this._pingServer = false;
                    _this._nextTime = undefined;
                    _this._video.removeEventListener('timeupdate', _this._onPlayerPositionChanged);
                    _this._video.removeEventListener('playing', _this._onStart);
                    _this._video.removeEventListener('seeked', _this._onSeeked);
                    _this._video.removeEventListener('seeking', _this._onSeeking);
                }
            }
        };
        xhr.send();
    };
    return PingService;
}());
exports.PingService = PingService;

},{}]},{},[11])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvdHMvYWQvYWQtYnJlYWsudHMiLCJzcmMvdHMvYWRhcHRpdmUtcGxheWVyLnRzIiwic3JjL3RzL2V2ZW50cy50cyIsInNyYy90cy9pZDMvaWQzLWRlY29kZXIudHMiLCJzcmMvdHMvaWQzL2lkMy1oYW5kbGVyLnRzIiwic3JjL3RzL2xpY2Vuc2UtbWFuYWdlci50cyIsInNyYy90cy9uYXRpdmUtcGxheWVyLnRzIiwic3JjL3RzL3BvbHlmaWxsL2FycmF5LnRzIiwic3JjL3RzL3BvbHlmaWxsL29iamVjdC50cyIsInNyYy90cy9wb2x5ZmlsbC92dHQtY3VlLnRzIiwic3JjL3RzL3VwbHluay1jb3JlLnRzIiwic3JjL3RzL3V0aWxzL29ic2VydmFibGUudHMiLCJzcmMvdHMvdXRpbHMvc2VnbWVudC1tYXAudHMiLCJzcmMvdHMvdXRpbHMvc3RyaW5nLW1hcC50cyIsInNyYy90cy91dGlscy90aHVtYm5haWwtaGVscGVyLnRzIiwic3JjL3RzL3V0aWxzL3V0aWxzLnRzIiwic3JjL3RzL3dlYi1zZXJ2aWNlcy9hc3NldC1pbmZvLXNlcnZpY2UudHMiLCJzcmMvdHMvd2ViLXNlcnZpY2VzL3Bpbmctc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtJQU9JLGlCQUFZLFFBQW1CO1FBQzNCLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7WUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUN2QyxJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxH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Q0FBQyxDQUFDO29CQUMxRCxLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxLQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzFELEtBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLEtBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDaEUsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDZixDQUFDO0lBQ0wsa0JBQUM7QUFBRCxDQXZIQSxBQXVIQyxJQUFBO0FBdkhZLG1CQUFXLGNBdUh2QixDQUFBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImV4cG9ydCBjbGFzcyBBZEJyZWFrIHtcbiAgICByZWFkb25seSBzdGFydFRpbWU6IG51bWJlcjtcbiAgICByZWFkb25seSBlbmRUaW1lOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBudW1BZHM6IG51bWJlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50czogU2VnbWVudFtdO1xuXG4gICAgY29uc3RydWN0b3Ioc2VnbWVudHM6IFNlZ21lbnRbXSkge1xuICAgICAgICBpZiAoc2VnbWVudHMgJiYgc2VnbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudHMgPSBzZWdtZW50cztcbiAgICAgICAgICAgIHRoaXMubnVtQWRzID0gc2VnbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5zdGFydFRpbWUgPSBzZWdtZW50c1swXS5zdGFydFRpbWU7XG4gICAgICAgICAgICB0aGlzLmVuZFRpbWUgPSBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXS5lbmRUaW1lO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiA9IHRoaXMuZW5kVGltZSAtIHRoaXMuc3RhcnRUaW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0QWRQb3NpdGlvbkF0KHRpbWU6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zZWdtZW50c1tpXS5zdGFydFRpbWUgPD0gdGltZSAmJiB0aW1lIDw9IHRoaXMuX3NlZ21lbnRzW2ldLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50QXQoaW5kZXg6IG51bWJlcik6IFNlZ21lbnQge1xuICAgICAgICBpZih0aGlzLl9zZWdtZW50cyAmJiBpbmRleCA+IC0xICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb250YWlucyh0aW1lOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSB0aGlzLmVuZFRpbWU7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuL3V0aWxzL29ic2VydmFibGUnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcbmltcG9ydCB7IElEM0hhbmRsZXIsIElEM1RhZ0V2ZW50LCBUeHh4SUQzRnJhbWVFdmVudCwgUHJpdklEM0ZyYW1lRXZlbnQsIFRleHRJRDNGcmFtZUV2ZW50LCBTbGljZUV2ZW50IH0gZnJvbSAnLi9pZDMvaWQzLWhhbmRsZXInO1xuaW1wb3J0IHsgSUQzRGF0YSB9IGZyb20gJy4vaWQzL2lkMy1kYXRhJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCAqIGFzIHRodW1iIGZyb20gJy4vdXRpbHMvdGh1bWJuYWlsLWhlbHBlcic7XG5pbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi9hZC9hZC1icmVhayc7XG5pbXBvcnQgeyBFdmVudHMgfSBmcm9tICcuL2V2ZW50cyc7XG5pbXBvcnQgeyBQbGF5ZXIsIFJlc29sdXRpb24sIE1pbWVUeXBlIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0IHsgaXNMb2NhbFN0b3JhZ2VBdmFpbGFibGUgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcbmltcG9ydCB7IExpY2Vuc2VNYW5hZ2VyIH0gZnJvbSAnLi9saWNlbnNlLW1hbmFnZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIEFkYXB0aXZlUGxheWVyIGV4dGVuZHMgT2JzZXJ2YWJsZSBpbXBsZW1lbnRzIFBsYXllciB7XG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfYWRhcHRpdmVTb3VyY2U6IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZTtcbiAgICBwcml2YXRlIF9tZWRpYVNvdXJjZTogTWVkaWFTb3VyY2U7XG4gICAgcHJpdmF0ZSBfdXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfb2JqZWN0VXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZTtcbiAgICBwcml2YXRlIF9waW5nU2VydmljZTogUGluZ1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfaWQzSGFuZGxlcjogSUQzSGFuZGxlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50TWFwOiBTZWdtZW50TWFwO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9maXJlZFJlYWR5RXZlbnQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNTYWZhcmk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNGaXJlZm94OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzQ2hyb21lOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzSUU6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNQYXVzZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfdGFyZ2V0VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX2ZvcmNlZEFkQnJlYWs6IEFkQnJlYWs7XG4gICAgcHJpdmF0ZSBfdmlkZW9SZWN0OiBDbGllbnRSZWN0O1xuICAgIHByaXZhdGUgX2VuZGVkOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3VzaW5nQ3VzdG9tVUk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaW50ZXJ2YWxJZDogbnVtYmVyO1xuICAgIHByaXZhdGUgX2xpY2Vuc2VNYW5hZ2VyOiBMaWNlbnNlTWFuYWdlcjtcblxuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZSxcbiAgICAgICAgbGltaXRSZXNvbHV0aW9uVG9WaWV3U2l6ZTogZmFsc2UsXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zPzogUGxheWVyT3B0aW9ucykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIC8vaW5pdCBjb25maWdcbiAgICAgICAgdmFyIGRhdGEgPSB7fTtcblxuICAgICAgICAvL3RyeSBwYXJzaW5nIGRhdGEgYXR0cmlidXRlIGNvbmZpZ1xuICAgICAgICB0cnkgeyBkYXRhID0gSlNPTi5wYXJzZSh2aWRlby5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29uZmlnJykpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7IH1cblxuICAgICAgICAvL21lcmdlIGRlZmF1bHRzIHdpdGggdXNlciBvcHRpb25zXG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2RlZmF1bHRzLCBvcHRpb25zLCBkYXRhKTtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyID0gbmV3IElEM0hhbmRsZXIodmlkZW8pO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCB0aGlzLl9vbklEM1RhZy5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlR4eHhJRDNGcmFtZSwgdGhpcy5fb25UeHh4SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHRoaXMuX29uUHJpdklEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0aGlzLl9vblRleHRJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgdGhpcy5fb25TbGljZUVudGVyZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUgPSB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblZpZGVvU2Vla2luZyA9IHRoaXMuX29uVmlkZW9TZWVraW5nLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVmlkZW9TZWVrZWQgPSB0aGlzLl9vblZpZGVvU2Vla2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuID0gdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kID0gdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVGltZXJUaWNrID0gdGhpcy5fb25UaW1lclRpY2suYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0lFID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzRmlyZWZveCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gMDtcblxuICAgICAgICB0aGlzLl9vdmVycmlkZUN1cnJlbnRUaW1lKCk7XG4gICAgICAgIHRoaXMuX292ZXJyaWRlRW5kZWQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUN1cnJlbnRUaW1lKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlICdjdXJyZW50VGltZScgcHJvcGVydHkgc28gd2UgY2FuIHByZXZlbnQgdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICB2YXIgY3VycmVudFRpbWVQcm9wZXJ0eSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpO1xuICAgICAgICBpZiAoY3VycmVudFRpbWVQcm9wZXJ0eSkge1xuXG4gICAgICAgICAgICB2YXIgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZVByb3BlcnR5LmdldDtcbiAgICAgICAgICAgIHZhciBzZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lUHJvcGVydHkuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5jYW5TZWVrKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2VuZGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBhY3R1YWxUaW1lID0gc2VsZi5nZXRTZWVrVGltZSh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcywgW2FjdHVhbFRpbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb3ZlcnJpZGVFbmRlZCgpOiB2b2lkIHtcbiAgICAgICAgLy9vdmVycmlkZSBlbmRlZCBwcm9wZXJ0eSBzbyB3ZSBjYW4gbWFrZSBpdCBub3QgcmVhZC1vbmx5LiBhbGxvd2luZyB1cyB0byBmaXJlIHRoZSAnZW5kZWQnXG4gICAgICAgIC8vIGV2ZW50IGFuZCBoYXZlIHRoZSB1aSByZXNwb25kIGNvcnJlY3RseVxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMuX3ZpZGVvLCAnZW5kZWQnLCB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5fZW5kZWQ7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4gRXZlbnRzO1xuICAgIH1cblxuICAgIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX3N0b3BNYWluTG9vcCgpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5fYWRhcHRpdmVTb3VyY2UgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmRlbGV0ZSgpO1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fb2JqZWN0VXJsKSB7XG4gICAgICAgICAgICB3aW5kb3cuVVJMLnJldm9rZU9iamVjdFVSTCh0aGlzLl9vYmplY3RVcmwpO1xuICAgICAgICAgICAgdGhpcy5fb2JqZWN0VXJsID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxvYWQodXJsOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3VybCA9IHVybDtcbiAgICAgICAgdGhpcy5fdGFyZ2V0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5fZm9yY2VkQWRCcmVhayA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9tZWRpYVNvdXJjZSA9IG5ldyBNZWRpYVNvdXJjZSgpO1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuX2FkYXB0aXZlU291cmNlICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kZWxldGUoKTtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uVmlkZW9UaW1lVXBkYXRlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIHRoaXMuX29uVmlkZW9TZWVraW5nKTtcbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25WaWRlb1NlZWtlZCk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2VuZGVkJywgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kKTtcblxuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25WaWRlb1NlZWtpbmcpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblZpZGVvU2Vla2VkKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZW5kZWQnLCB0aGlzLl9vblZpZGVvUGxheWJhY2tFbmQpO1xuICAgICAgICAvLyB2aWRlby5vbmxvYWRlZG1ldGFkYXRhIGlzIHRoZSBmaXJzdCB0aW1lIHRoZSB2aWRlbyB3aWR0aC9oZWlnaHQgaXMgYXZhaWxhYmxlXG4gICAgICAgIHRoaXMuX3ZpZGVvLm9ubG9hZGVkbWV0YWRhdGEgPSB0aGlzLnVwZGF0ZVZpZGVvUmVjdC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuX21lZGlhU291cmNlLmFkZEV2ZW50TGlzdGVuZXIoJ3NvdXJjZW9wZW4nLCB0aGlzLl9vbk1lZGlhU291cmNlT3Blbik7XG5cbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSBuZXcgTW9kdWxlLkFkYXB0aXZlU291cmNlKCk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uQmVhbUxvYWRlZCh0aGlzLl9vbkJlYW1Mb2FkZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVHJhY2tMb2FkZWQodGhpcy5fb25UcmFja0xvYWRlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25Mb2FkZWQodGhpcy5fb25Tb3VyY2VMb2FkZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uTG9hZEVycm9yKHRoaXMuX29uTG9hZEVycm9yLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkRybUVycm9yKHRoaXMuX29uRHJtRXJyb3IuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uU2VnbWVudE1hcENoYW5nZWQodGhpcy5fb25TZWdtZW50TWFwQ2hhbmdlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnRNYWluTG9vcCh0aGlzLl9zdGFydE1haW5Mb29wLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdG9wTWFpbkxvb3AodGhpcy5fc3RvcE1haW5Mb29wLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydExpY2Vuc2VSZXF1ZXN0KHRoaXMuX3N0YXJ0TGljZW5zZVJlcXVlc3QuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgaWYgKGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlKCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnNldExvYWRBbmRTYXZlQmFuZHdpZHRoKHRoaXMuX2xvYWRCYW5kd2lkdGhIaXN0b3J5LmJpbmQodGhpcyksIHRoaXMuX3NhdmVCYW5kd2lkdGhIaXN0b3J5LmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX29iamVjdFVybCkge1xuICAgICAgICAgICAgd2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwodGhpcy5fb2JqZWN0VXJsKTtcbiAgICAgICAgICAgIHRoaXMuX29iamVjdFVybCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTCh0aGlzLl9tZWRpYVNvdXJjZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHRoaXMuX29iamVjdFVybDtcbiAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIHBsYXllciBjYW4gc2VlayBnaXZlbiBpdCdzIGN1cnJlbnQgcG9zaXRpb24gYW5kXG4gICAgICogd2hldGhlciBvciBub3QgaXQncyBpbiBhbiBhZCBicmVhay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWssIG90aGVyd2lzZSBmYWxzZS5cbiAgICAgKi9cbiAgICBjYW5TZWVrKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSAnTElWRScgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT09ICdFVkVOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9jYW4ndCBwcmV2ZW50IGFsbCBzZWVrcyAodmlhIHVpIG9yIGN1cnJlbnRUaW1lIHByb3BlcnR5KVxuICAgICAgICAvLyB3aXRob3V0IHVzaW5nIGEgY3VzdG9tIHVpIChVUC0zMjY5KS5cbiAgICAgICAgaWYgKCF0aGlzLl91c2luZ0N1c3RvbVVJKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fc2VnbWVudE1hcCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIXRoaXMuX3NlZ21lbnRNYXAuaW5BZEJyZWFrKHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lKTtcbiAgICB9XG5cbiAgICBnZXRTZWVrVGltZSh0YXJnZXRUaW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09ICdMSVZFJyB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0VWRU5UJykge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2FsbG93IHVzZXJzIHRvIHNlZWsgYXQgYW55IHRpbWVcbiAgICAgICAgaWYgKCF0aGlzLl9jb25maWcuZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fdXNpbmdDdXN0b21VSSkge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY3VycmVudFRpbWUgPSB0aGlzLl92aWRlby5jdXJyZW50VGltZTtcblxuICAgICAgICAvL2FyZSB3ZSBzZWVraW5nIHRvIHRoZSBtaWRkbGUgb2YgYW4gYWQ/XG4gICAgICAgIC8vaWYgc28sIHNlZWsgdG8gYmVnaW5uaW5nIG9mIHRoZSBhZCBhbmQgcGxheSBvbi5cbiAgICAgICAgbGV0IGFkQnJlYWsgPSB0aGlzLl9zZWdtZW50TWFwLmdldEFkQnJlYWsodGFyZ2V0VGltZSk7XG4gICAgICAgIGlmIChhZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRCcmVhay5zdGFydFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2FyZSB3ZSBza2lwcGluZyBwYXN0IGFueSBhZHMgYnkgc2Vla2luZz9cbiAgICAgICAgbGV0IGFkQnJlYWtzID0gdGhpcy5fc2VnbWVudE1hcC5nZXRBZEJyZWFrc0JldHdlZW4oY3VycmVudFRpbWUsIHRhcmdldFRpbWUpO1xuICAgICAgICBpZiAoYWRCcmVha3MgJiYgYWRCcmVha3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy9wbGF5IG5lYXJlc3QgYWQgYnJlYWsgdGhlbiBza2lwIHRvIG9yaWdpbmFsIHRhcmdldCB0aW1lXG4gICAgICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdGFyZ2V0VGltZTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSBhZEJyZWFrc1thZEJyZWFrcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9mb3JjZWRBZEJyZWFrLnN0YXJ0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRCcm93c2VyKHNhZmFyaTogYm9vbGVhbiwgaWU6IGJvb2xlYW4sIGNocm9tZTogYm9vbGVhbiwgZmlyZWZveDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IHNhZmFyaTtcbiAgICAgICAgdGhpcy5faXNJRSA9IGllO1xuICAgICAgICB0aGlzLl9pc0ZpcmVmb3ggPSBmaXJlZm94O1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGNocm9tZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1RpbWVVcGRhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl92aWRlbykge1xuICAgICAgICAgICAgLy9pZiB3ZSBmb3JjZWQgdGhlIHVzZXIgdG8gd2F0Y2ggYW4gYWQgd2hlbiB0aGV5IHRyaWVkIHRvIHNlZWsgcGFzdCBpdCxcbiAgICAgICAgICAgIC8vIHRoaXMgd2lsbCBzZWVrIHRvIHRoZSBkZXNpcmVkIHBvc2l0aW9uIGFmdGVyIHRoZSBhZCBpcyBvdmVyXG4gICAgICAgICAgICBpZiAodGhpcy5fZm9yY2VkQWRCcmVhayAmJiB0aGlzLl92aWRlby5jdXJyZW50VGltZSA+IHRoaXMuX2ZvcmNlZEFkQnJlYWsuZW5kVGltZSkge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRUaW1lID0gdGhpcy5fdGFyZ2V0VGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPSB0YXJnZXRUaW1lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIHRoZSB1c2VyIGNsaWNrcyBvbiB0aGUgdGltZWxpbmUgd2hlbiB1c2luZyB0aGUgYnJvd3NlcidzIG5hdGl2ZSB1aSxcbiAgICAgICAgICAgIC8vIGl0IGNhdXNlcyBhICd0aW1ldXBkYXRlJyBldmVudCBqdXN0IGJlZm9yZSBhICdzZWVrJyBldmVudCwgY2F1c2luZyB0aGVcbiAgICAgICAgICAgIC8vIHVwbHluayBwbGF5ZXIgdG8gc2VsZWN0IHJheSBieSBiYW5kd2lkdGguIHRoZSByZXN1bHQgb2YgdGhhdCBpcyBkb3duc2hpZnRpbmdcbiAgICAgICAgICAgIC8vIHRvIHRoZSBsb3dlc3QgcmF5IHJpZ2h0IGJlZm9yZSB0aGUgc2Vlay4gdGhhdCByYXkgdHlwaWNhbGx5IGlzbid0IGxvYWRlZCB5ZXRcbiAgICAgICAgICAgIC8vIHNvIGFuIGVycm9yIG9jY3VycyBhbmQgdGhlIHNlZWsgZmFpbHMgY2F1c2luZyBwbGF5YmFjayB0byBzdG9wLlxuICAgICAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlICYmIHRoaXMuX3ZpZGVvICYmICF0aGlzLl92aWRlby5zZWVraW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UaW1lVXBkYXRlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vYXJlIHdlIGF0IG9yIG5lYXIgdGhlIGVuZCBvZiBhIFZPRCBhc3NldC4gdmlkZW8uY3VycmVudFRpbWUgZG9lc24ndCBhbHdheXMgZXF1YWwgdmlkZW8uZHVyYXRpb24gd2hlbiB0aGUgYnJvd3NlclxuICAgICAgICAgICAgLy8gc3RvcHMgcGxheWJhY2sgYXQgdGhlIGVuZCBvZiBhIFZPRC5cbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ1ZPRCcgJiYgIXRoaXMuX2VuZGVkICYmIHRoaXMuX3ZpZGVvLmR1cmF0aW9uIC0gdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPD0gMC4yNSkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fZW5kZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgLy9maXJlIHZpZGVvLmVuZGVkIGV2ZW50IG1hbnVhbGx5XG4gICAgICAgICAgICAgICAgdmFyIGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KCdlbmRlZCcpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucGF1c2UoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gd2UgY2FuIHJlc3BvbmQgdG8gdmlkZW8gcmVzaXplcyBxdWlja2x5IGJ5IHJ1bm5pbmcgd2l0aGluIF9vblZpZGVvVGltZVVwZGF0ZSgpXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVZpZGVvUmVjdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1NlZWtpbmcoKTogdm9pZCB7XG4gICAgICAgIC8vUGF1c2luZyBkdXJpbmcgc2VlayBzZWVtcyB0byBoZWxwIHNhZmFyaSBvdXQgd2hlbiBzZWVraW5nIGJleW9uZCB0aGVcbiAgICAgICAgLy9lbmQgb2YgaXQncyB2aWRlbyBidWZmZXIsIHBlcmhhcHMgSSB3aWxsIGZpbmQgYW5vdGhlciBzb2x1dGlvbiBhdCBzb21lXG4gICAgICAgIC8vcG9pbnQsIGJ1dCBmb3Igbm93IHRoaXMgaXMgd29ya2luZy5cbiAgICAgICAgaWYgKHRoaXMuX2lzU2FmYXJpICYmICEodGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJFVkVOVFwiIHx8IHRoaXMucGxheWxpc3RUeXBlID09IFwiTElWRVwiKSkge1xuICAgICAgICAgICAgdGhpcy5faXNQYXVzZWQgPSB0aGlzLl92aWRlby5wYXVzZWQ7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5wYXVzZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2Vlayh0aGlzLl92aWRlby5jdXJyZW50VGltZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1NlZWtlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2lzU2FmYXJpICYmICF0aGlzLl9pc1BhdXNlZCAmJiAhKHRoaXMucGxheWxpc3RUeXBlID09IFwiRVZFTlRcIiB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkxJVkVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBsYXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9QbGF5YmFja0VuZCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UudmlkZW9QbGF5YmFja0VuZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uTWVkaWFTb3VyY2VPcGVuKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5pbml0aWFsaXplVmlkZW9FbGVtZW50KHRoaXMuX3ZpZGVvLCB0aGlzLl9tZWRpYVNvdXJjZSwgdGhpcy5fY29uZmlnLmRlYnVnKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UubG9hZCh0aGlzLl91cmwpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzVGFnKGV2ZW50OiBJRDNUYWdFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5JRDNUYWcsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblR4eHhJRDNGcmFtZShldmVudDogVHh4eElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVHh4eElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Qcml2SUQzRnJhbWUoZXZlbnQ6IFByaXZJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlByaXZJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVGV4dElEM0ZyYW1lKGV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UZXh0SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNsaWNlRW50ZXJlZChldmVudDogU2xpY2VFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TbGljZUVudGVyZWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkJlYW1Mb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UgPSBuZXcgQXNzZXRJbmZvU2VydmljZSh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW4sIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlc3Npb25JZCk7XG4gICAgICAgIHRoaXMuX3BpbmdTZXJ2aWNlID0gbmV3IFBpbmdTZXJ2aWNlKHRoaXMuX2FkYXB0aXZlU291cmNlLmRvbWFpbiwgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2Vzc2lvbklkLCB0aGlzLl92aWRlbyk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8udGV4dFRyYWNrcy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoY2hhbmdlVHJhY2tFdmVudDogVHJhY2tFdmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5vblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkJlYW1Mb2FkZWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVHJhY2tMb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlRyYWNrTG9hZGVkKTtcblxuICAgICAgICBpZiAoIXRoaXMuX2ZpcmVkUmVhZHlFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlJlYWR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3N0YXJ0TWFpbkxvb3AoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pbnRlcnZhbElkID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwodGhpcy5fb25UaW1lclRpY2ssIDE1KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3N0b3BNYWluTG9vcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2ludGVydmFsSWQgIT09IDApIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5faW50ZXJ2YWxJZCk7XG4gICAgICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVGltZXJUaWNrKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRpY2soKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc1VwbHlua1VybCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICBjb25zdCB0ZW1wID0gdXJsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiB0ZW1wLmluZGV4T2YoJ3VwbHluay5jb20nKSA+IC0xIHx8IHRlbXAuaW5kZXhPZignZG93bmx5bmsuY29tJykgPiAtMTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNvdXJjZUxvYWRlZCgpOiB2b2lkIHtcbiAgICAgICAgLy9wcmUtbG9hZCBzZWdtZW50IG1hcCBzbyBhc3NldEluZm8gZGF0YSB3aWxsIGJlIGF2YWlsYWJsZSB3aGVuXG4gICAgICAgIC8vIG5ldyBzZWdtZW50cyBhcmUgZW5jb3VudGVyZWQuXG4gICAgICAgIGlmICghdGhpcy5faXNVcGx5bmtVcmwodGhpcy5fdXJsKSkge1xuICAgICAgICAgICAgLy9DaGVjayBpZiB3ZSBoYXZlIGFuIHVwbHluayBhc3NldCwgaWYgbm90Li4uLiBUaGVuIGp1c3Qgc3RhcnQgcGxheWJhY2tcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0KCk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Tb3VyY2VMb2FkZWQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkU2VnbWVudE1hcCh0aGlzLl9zZWdtZW50TWFwLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnQoKTtcbiAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Tb3VyY2VMb2FkZWQpO1xuXG4gICAgICAgICAgICAgICAgLy9zZXQgdGhlIHBvc3RlciB1cmxcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fY29uZmlnLnNob3dQb3N0ZXIgJiYgdGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJWT0RcIikge1xuICAgICAgICAgICAgICAgICAgICBsZXQgY29udGVudFNlZ21lbnQgPSB0aGlzLl9zZWdtZW50TWFwLmNvbnRlbnRTZWdtZW50c1swXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGNvbnRlbnRBc3NldCA9IHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UuZ2V0QXNzZXRJbmZvKGNvbnRlbnRTZWdtZW50LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucG9zdGVyID0gY29udGVudEFzc2V0LnBvc3RlclVybDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uTG9hZEVycm9yKG1lc3NhZ2U6IHN0cmluZywgY29kZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkxvYWRFcnJvciwgeyBlcnJvcjogbWVzc2FnZSwgY29kZTogY29kZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkRybUVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Ecm1FcnJvciwgeyBlcnJvcjogbWVzc2FnZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNlZ21lbnRNYXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09IFwiVk9EXCIpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5fc2VnbWVudE1hcCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NlZ21lbnRNYXAgPSBuZXcgU2VnbWVudE1hcCh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZWdtZW50TWFwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbml0U2VnbWVudFRleHRUcmFjaygpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2luaXRBZEJyZWFrVGV4dFRyYWNrKCk7XG5cbiAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TZWdtZW50TWFwTG9hZGVkLCB7IHNlZ21lbnRNYXA6IHRoaXMuX3NlZ21lbnRNYXAgfSk7XG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuTG9hZGVkQWRCcmVha3MsIHsgYWRCcmVha3M6IHRoaXMuX3NlZ21lbnRNYXAuYWRCcmVha3MgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zZWdtZW50TWFwID0gbmV3IFNlZ21lbnRNYXAodGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2VnbWVudE1hcCk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TZWdtZW50TWFwTG9hZGVkLCB7IHNlZ21lbnRNYXA6IHRoaXMuX3NlZ21lbnRNYXAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zdGFydExpY2Vuc2VSZXF1ZXN0KCk6IHZvaWQge1xuICAgICAgICAvL2NvbnNvbGUubG9nKFwiW2FkYXB0aXZlLXBsYXllci50c10gU3RhcnQgbGljZW5zZSByZXF1ZXN0IFBTU0g6IFwiICsgdGhpcy5fYWRhcHRpdmVTb3VyY2UucHNzaCk7XG5cbiAgICAgICAgaWYgKHRoaXMuX2xpY2Vuc2VNYW5hZ2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyID0gbmV3IExpY2Vuc2VNYW5hZ2VyKHRoaXMuX3ZpZGVvKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlci5zZXRLZXlTZXJ2ZXJQcmVmaXgodGhpcy5fYWRhcHRpdmVTb3VyY2Uua2V5U2VydmVyUHJlZml4KTtcbiAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXIuYWRkTGljZW5zZVJlcXVlc3QoYmFzZTY0VG9CdWZmZXIodGhpcy5fYWRhcHRpdmVTb3VyY2UucHNzaCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2xvYWRCYW5kd2lkdGhIaXN0b3J5KCk6IFNsaWNlRG93bmxvYWRNZXRyaWNbXVtdIHtcbiAgICAgICAgbGV0IGhpc3RvcnlWZXJzaW9uID0gcGFyc2VJbnQobG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VmVyc2lvblwiKSwgMTApIHx8IDA7XG4gICAgICAgIC8vIEN1cnJlbnQgdmVyc2lvbiBpcyAyLiBJZiBvbGRlciB0aGFuIHRoYXQsIGRvbid0IGxvYWQgaXRcbiAgICAgICAgaWYgKGhpc3RvcnlWZXJzaW9uIDwgMiAmJiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlcIikgIT0gbnVsbCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJbYWRhcHRpdmUtcGxheWVyLnRzXSBfbG9hZEJhbmR3aWR0aEhpc3RvcnkgZm91bmQgYW4gb2xkZXIgaGlzdG9yeSB2ZXJzaW9uLiBSZW1vdmluZyBpdFwiKTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFwiVXBseW5rSGlzdG9yeVwiKTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFwiVXBseW5rSGlzdG9yeVRpbWVzdGFtcFwiKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGxldCB0aW1lc3RhbXBTdHIgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlUaW1lc3RhbXBcIik7XG4gICAgICAgIGxldCB0aW1lc3RhbXAgPSBwYXJzZUludCh0aW1lc3RhbXBTdHIsIDEwKSB8fCAwO1xuICAgICAgICBsZXQgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBjb25zdCBNQVhfQUdFID0gNjAgKiA2MCAqIDEwMDA7IC8vIDEgaHIsIGluIG1pbGxpc2VjXG4gICAgICAgIGlmIChub3cgLSB0aW1lc3RhbXAgPCBNQVhfQUdFKSB7XG4gICAgICAgICAgICBsZXQgaGlzdG9yeSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVwiKTtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKGhpc3RvcnkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgX3NhdmVCYW5kd2lkdGhIaXN0b3J5KGhpc3Rvcnk6IFNsaWNlRG93bmxvYWRNZXRyaWNbXVtdKTogdm9pZCB7XG4gICAgICAgIGlmIChoaXN0b3J5ID09IG51bGwpIHJldHVybjtcblxuICAgICAgICBsZXQgdGltZXN0YW1wID0gRGF0ZS5ub3coKVxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcIlVwbHlua0hpc3RvcnlWZXJzaW9uXCIsIFwiMlwiKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VGltZXN0YW1wXCIsIHRpbWVzdGFtcC50b1N0cmluZygpKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIsIEpTT04uc3RyaW5naWZ5KGhpc3RvcnkpKTtcbiAgICB9XG5cbiAgICBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzaXplOiBcInNtYWxsXCIgfCBcImxhcmdlXCIgPSBcInNtYWxsXCIpOiB0aHVtYi5UaHVtYm5haWwge1xuICAgICAgICByZXR1cm4gdGh1bWIuZ2V0VGh1bWJuYWlsKHRpbWUsIHRoaXMuX3NlZ21lbnRNYXAsIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UsIHNpemUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2luaXRTZWdtZW50VGV4dFRyYWNrKCk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIFZUVEN1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIC8vYmFpbCwgY2FuJ3QgY3JlYXRlIGN1ZXNcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWdtZW50VGV4dFRyYWNrID0gdGhpcy5fZ2V0T3JDcmVhdGVUZXh0VHJhY2soXCJtZXRhZGF0YVwiLCBcInNlZ21lbnRzXCIpO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudE1hcC5sZW5ndGg7IGkrKykge1xuXG4gICAgICAgICAgICBsZXQgc2VnbWVudCA9IHRoaXMuX3NlZ21lbnRNYXAuZ2V0U2VnbWVudEF0KGkpO1xuICAgICAgICAgICAgbGV0IGN1ZSA9IG5ldyBWVFRDdWUoc2VnbWVudC5zdGFydFRpbWUsIHNlZ21lbnQuZW5kVGltZSwgc2VnbWVudC5pZCk7XG5cbiAgICAgICAgICAgIGlmIChjdWUgIT09IHVuZGVmaW5lZCkge1xuXG4gICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnRlclwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnQoc2VnbWVudCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImV4aXRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRTZWdtZW50KHNlZ21lbnQsIChhc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFeGl0ZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBzZWdtZW50VGV4dFRyYWNrLmFkZEN1ZShjdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaW5pdEFkQnJlYWtUZXh0VHJhY2soKTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgVlRUQ3VlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgLy9iYWlsLCBjYW4ndCBjcmVhdGUgY3Vlc1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGFkQnJlYWtzID0gdGhpcy5fc2VnbWVudE1hcC5hZEJyZWFrcztcbiAgICAgICAgaWYgKGFkQnJlYWtzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHRyYWNrID0gdGhpcy5fZ2V0T3JDcmVhdGVUZXh0VHJhY2soXCJtZXRhZGF0YVwiLCBcImFkYnJlYWtzXCIpO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWRCcmVha3MubGVuZ3RoOyBpKyspIHtcblxuICAgICAgICAgICAgbGV0IGFkQnJlYWsgPSBhZEJyZWFrc1tpXTtcbiAgICAgICAgICAgIGxldCBjdWUgPSBuZXcgVlRUQ3VlKGFkQnJlYWsuc3RhcnRUaW1lLCBhZEJyZWFrLmVuZFRpbWUsIFwiYWRicmVha1wiKTtcblxuICAgICAgICAgICAgaWYgKGN1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cbiAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImVudGVyXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0VudGVyZWQsIHsgYWRCcmVhazogYWRCcmVhayB9KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZXhpdFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFeGl0ZWQsIHsgYWRCcmVhazogYWRCcmVhayB9KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHRyYWNrLmFkZEN1ZShjdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2lzRmlyZWZveCAmJiAhdGhpcy5fdmlkZW8uYXV0b3BsYXkgJiYgYWRCcmVha3NbMF0uc3RhcnRUaW1lID09PSAwICYmIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lID09PSAwKSB7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiBhZEJyZWFrc1swXSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2dldE9yQ3JlYXRlVGV4dFRyYWNrKGtpbmQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyk6IFRleHRUcmFjayB7XG4gICAgICAgIC8vbG9vayBmb3IgcHJldmlvdXNseSBjcmVhdGVkIHRyYWNrXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fdmlkZW8udGV4dFRyYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IHRyYWNrID0gdGhpcy5fdmlkZW8udGV4dFRyYWNrc1tpXTtcbiAgICAgICAgICAgIGlmICh0cmFjay5raW5kID09PSBraW5kICYmIHRyYWNrLmxhYmVsID09PSBsYWJlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cmFjaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vcmV0dXJuIG5ldyB0cmFja1xuICAgICAgICByZXR1cm4gdGhpcy5fdmlkZW8uYWRkVGV4dFRyYWNrKGtpbmQsIGxhYmVsKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQ6IFRyYWNrRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlVmlkZW9SZWN0KCk6IHZvaWQge1xuICAgICAgICBsZXQgY3VycmVudFZpZGVvUmVjdCA9IHRoaXMuX3ZpZGVvLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIGlmICgoIXRoaXMuX3ZpZGVvUmVjdCkgfHwgKHRoaXMuX3ZpZGVvUmVjdC53aWR0aCAhPSBjdXJyZW50VmlkZW9SZWN0LndpZHRoIHx8IHRoaXMuX3ZpZGVvUmVjdC5oZWlnaHQgIT0gY3VycmVudFZpZGVvUmVjdC5oZWlnaHQpKSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlb1JlY3QgPSBjdXJyZW50VmlkZW9SZWN0O1xuICAgICAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlICYmIHRoaXMuX2NvbmZpZy5saW1pdFJlc29sdXRpb25Ub1ZpZXdTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2V0TWF4VmlkZW9SZXNvbHV0aW9uKGN1cnJlbnRWaWRlb1JlY3QuaGVpZ2h0LCBjdXJyZW50VmlkZW9SZWN0LndpZHRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrcygpOiBVcGx5bmsuQXVkaW9UcmFja1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvVHJhY2tzO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrSWQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvVHJhY2tJZDtcbiAgICB9XG5cbiAgICBzZXQgYXVkaW9UcmFja0lkKGlkOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9UcmFja0lkID0gaWQ7XG4gICAgfVxuXG4gICAgZ2V0IGRvbWFpbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluO1xuICAgIH1cblxuICAgIGdldCBzZXNzaW9uSWQoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlc3Npb25JZDtcbiAgICB9XG5cbiAgICBnZXQgbnVtYmVyT2ZSYXlzKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5udW1iZXJPZlJheXM7XG4gICAgfVxuXG4gICAgZ2V0IGF2YWlsYWJsZUJhbmR3aWR0aHMoKTogbnVtYmVyW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXZhaWxhYmxlQmFuZHdpZHRocztcbiAgICB9XG5cbiAgICBnZXQgYXZhaWxhYmxlUmVzb2x1dGlvbnMoKTogUmVzb2x1dGlvbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF2YWlsYWJsZVJlc29sdXRpb25zO1xuICAgIH1cblxuICAgIGdldCBhdmFpbGFibGVNaW1lVHlwZXMoKTogTWltZVR5cGVbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdmFpbGFibGVNaW1lVHlwZXM7XG4gICAgfVxuXG4gICAgZ2V0IHNlZ21lbnRNYXAoKTogU2VnbWVudE1hcCB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50TWFwO1xuICAgIH1cblxuICAgIGdldCBhZEJyZWFrcygpOiBBZEJyZWFrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudE1hcC5hZEJyZWFrcztcbiAgICB9XG5cbiAgICBnZXQgZHVyYXRpb24oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlID8gdGhpcy5fYWRhcHRpdmVTb3VyY2UuZHVyYXRpb24gOiAwO1xuICAgIH1cblxuICAgIGdldCBwbGF5bGlzdFR5cGUoKTogXCJWT0RcIiB8IFwiRVZFTlRcIiB8IFwiTElWRVwiIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLnBsYXlsaXN0VHlwZTtcbiAgICB9XG5cbiAgICBnZXQgc3VwcG9ydHNUaHVtYm5haWxzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVSZXNvbHV0aW9ucy5sZW5ndGggPiAwXG4gICAgfVxuXG4gICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ0FkYXB0aXZlUGxheWVyJztcbiAgICB9XG5cbiAgICBnZXQgdmVyc2lvbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJzAyLjAwLjE3MDkyMTAwJzsgLy93aWxsIGJlIG1vZGlmaWVkIGJ5IHRoZSBidWlsZCBzY3JpcHRcbiAgICB9XG59XG4iLCJleHBvcnQgY29uc3QgRXZlbnRzID0ge1xuICAgIEJlYW1Mb2FkZWQ6ICAgICAgICdiZWFtbG9hZGVkJyxcbiAgICBUcmFja0xvYWRlZDogICAgICAndHJhY2tsb2FkZWQnLFxuICAgIFNvdXJjZUxvYWRlZDogICAgICdzb3VyY2Vsb2FkZWQnLFxuICAgIExvYWRFcnJvcjogICAgICAgICdsb2FkZXJyb3InLFxuICAgIERybUVycm9yOiAgICAgICAgICdkcm1lcnJvcicsXG4gICAgU2VnbWVudE1hcExvYWRlZDogJ3NlZ21lbnRtYXBMb2FkZWQnLFxuICAgIExvYWRlZEFkQnJlYWtzOiAgICdsb2FkZWRhZGJyZWFrcycsXG4gICAgSUQzVGFnOiAgICAgICAgICAgJ2lkM1RhZycsXG4gICAgVHh4eElEM0ZyYW1lOiAgICAgJ3R4eHhJZDNGcmFtZScsXG4gICAgUHJpdklEM0ZyYW1lOiAgICAgJ3ByaXZJZDNGcmFtZScsXG4gICAgVGV4dElEM0ZyYW1lOiAgICAgJ3RleHRJZDNGcmFtZScsXG4gICAgU2xpY2VFbnRlcmVkOiAgICAgJ3NsaWNlRW50ZXJlZCcsXG4gICAgQXNzZXRFbnRlcmVkOiAgICAgJ2Fzc2V0ZW50ZXJlZCcsXG4gICAgQXNzZXRFeGl0ZWQ6ICAgICAgJ2Fzc2V0ZXhpdGVkJyxcbiAgICBBZEJyZWFrRW50ZXJlZDogICAnYWRicmVha2VudGVyZWQnLFxuICAgIEFkQnJlYWtFeGl0ZWQ6ICAgICdhZGJyZWFrZXhpdGVkJyxcbiAgICBSZWFkeTogICAgICAgICAgICAncmVhZHknXG59OyIsImltcG9ydCB7IHNsaWNlIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhEYXRhIHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgdmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXh0RnJhbWUge1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eEZyYW1lIHtcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpdkZyYW1lIHtcbiAgICBvd25lcjogc3RyaW5nO1xuICAgIGRhdGE6IFVpbnQ4QXJyYXk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUQzRnJhbWUge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZGF0YTogVWludDhBcnJheTtcbn1cblxuZXhwb3J0IGNsYXNzIElEM0RlY29kZXIge1xuXG4gICAgc3RhdGljIGdldEZyYW1lKGJ1ZmZlcjogVWludDhBcnJheSk6IElEM0ZyYW1lIHtcbiAgICAgICAgaWYgKGJ1ZmZlci5sZW5ndGggPCAyMSkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIGh0dHA6Ly9pZDMub3JnL2lkM3YyLjMuMFxuICAgICAgICArLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0rXG4gICAgICAgIHwgICAgICBIZWFkZXIgKDEwIGJ5dGVzKSAgICAgIHxcbiAgICAgICAgKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tK1xuICAgICAgICBbMF0gICAgID0gJ0knXG4gICAgICAgIFsxXSAgICAgPSAnRCdcbiAgICAgICAgWzJdICAgICA9ICczJ1xuICAgICAgICBbMyw0XSAgID0ge1ZlcnNpb259XG4gICAgICAgIFs1XSAgICAgPSB7RmxhZ3N9XG4gICAgICAgIFs2LTldICAgPSB7SUQzIFNpemV9XG4gICAgICAgIFsxMC0xM10gPSB7RnJhbWUgSUR9XG4gICAgICAgIFsxNC0xN10gPSB7RnJhbWUgU2l6ZX1cbiAgICAgICAgWzE4LDE5XSA9IHtGcmFtZSBGbGFnc30gXG4gICAgICAgICovXG4gICAgICAgIGlmIChidWZmZXJbMF0gPT09IDczICYmICAvLyBJXG4gICAgICAgICAgICBidWZmZXJbMV0gPT09IDY4ICYmICAvLyBEXG4gICAgICAgICAgICBidWZmZXJbMl0gPT09IDUxKSB7ICAvLyAzXG5cbiAgICAgICAgICAgIGxldCBmcmFtZVR5cGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZmZlclsxMF0sIGJ1ZmZlclsxMV0sIGJ1ZmZlclsxMl0sIGJ1ZmZlclsxM10pO1xuXG4gICAgICAgICAgICBsZXQgc2l6ZSA9IDA7XG4gICAgICAgICAgICBzaXplID0gKGJ1ZmZlclsxNF0gPDwgMjQpO1xuICAgICAgICAgICAgc2l6ZSB8PSAoYnVmZmVyWzE1XSA8PCAxNik7XG4gICAgICAgICAgICBzaXplIHw9IChidWZmZXJbMTZdIDw8IDgpO1xuICAgICAgICAgICAgc2l6ZSB8PSBidWZmZXJbMTddO1xuXG4gICAgICAgICAgICBsZXQgZGF0YSA9IHNsaWNlKGJ1ZmZlciwgMjApO1xuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogZnJhbWVUeXBlLCBzaXplOiBzaXplLCBkYXRhOiBkYXRhIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVUZXh0RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogVGV4dEZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OlxuICAgICAgICBbMF0gICA9IHtUZXh0IEVuY29kaW5nfVxuICAgICAgICBbMS0/XSA9IHtWYWx1ZX1cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVswXSAhPT0gMykge1xuICAgICAgICAgICAgLy9vbmx5IHN1cHBvcnQgVVRGLThcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGxldCBkYXRhID0gc2xpY2UoaWQzRnJhbWUuZGF0YSwgMSk7XG4gICAgICAgIHJldHVybiB7IHZhbHVlOiBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKGRhdGEpIH07XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVR4eHhGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBUeHh4RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6XG4gICAgICAgIFswXSAgID0ge1RleHQgRW5jb2Rpbmd9XG4gICAgICAgIFsxLT9dID0ge0Rlc2NyaXB0aW9ufVxcMHtWYWx1ZX1cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVswXSAhPT0gMykge1xuICAgICAgICAgICAgLy9vbmx5IHN1cHBvcnQgVVRGLThcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgICBsZXQgZGVzY3JpcHRpb24gPSBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKHNsaWNlKGlkM0ZyYW1lLmRhdGEsIGluZGV4KSk7XG5cbiAgICAgICAgaW5kZXggKz0gZGVzY3JpcHRpb24ubGVuZ3RoICsgMTtcbiAgICAgICAgbGV0IHZhbHVlID0gSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihzbGljZShpZDNGcmFtZS5kYXRhLCBpbmRleCkpO1xuXG4gICAgICAgIHJldHVybiB7IGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbiwgdmFsdWU6IHZhbHVlIH07XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVByaXZGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBQcml2RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6IDx0ZXh0IHN0cmluZz5cXDA8YmluYXJ5IGRhdGE+XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9maW5kIG51bGwgdGVybWluYXRvclxuICAgICAgICBsZXQgbnVsbEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpZDNGcmFtZS5kYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVtpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG51bGxJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgb3duZXIgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIHNsaWNlKGlkM0ZyYW1lLmRhdGEsIDAsIG51bGxJbmRleCkpO1xuICAgICAgICBsZXQgcHJpdmF0ZURhdGEgPSBzbGljZShpZDNGcmFtZS5kYXRhLCBudWxsSW5kZXggKyAxKTtcblxuICAgICAgICByZXR1cm4geyBvd25lcjogb3duZXIsIGRhdGE6IHByaXZhdGVEYXRhIH07XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy84OTM2OTg0L3VpbnQ4YXJyYXktdG8tc3RyaW5nLWluLWphdmFzY3JpcHQvMjIzNzMxOTdcbiAgICAvLyBodHRwOi8vd3d3Lm9uaWNvcy5jb20vc3RhZmYvaXovYW11c2UvamF2YXNjcmlwdC9leHBlcnQvdXRmLnR4dFxuICAgIC8qIHV0Zi5qcyAtIFVURi04IDw9PiBVVEYtMTYgY29udmVydGlvblxuICAgICAqXG4gICAgICogQ29weXJpZ2h0IChDKSAxOTk5IE1hc2FuYW8gSXp1bW8gPGl6QG9uaWNvcy5jby5qcD5cbiAgICAgKiBWZXJzaW9uOiAxLjBcbiAgICAgKiBMYXN0TW9kaWZpZWQ6IERlYyAyNSAxOTk5XG4gICAgICogVGhpcyBsaWJyYXJ5IGlzIGZyZWUuICBZb3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5IGl0LlxuICAgICAqL1xuICAgIHN0YXRpYyB1dGY4QXJyYXlUb1N0cihhcnJheTogVWludDhBcnJheSk6IHN0cmluZyB7XG5cbiAgICAgICAgbGV0IGNoYXIyOiBhbnk7XG4gICAgICAgIGxldCBjaGFyMzogYW55O1xuICAgICAgICBsZXQgb3V0ID0gXCJcIjtcbiAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICBsZXQgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gICAgICAgIHdoaWxlIChpIDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgYyA9IGFycmF5W2krK107XG4gICAgICAgICAgICBzd2l0Y2ggKGMgPj4gNCkge1xuICAgICAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICBjYXNlIDE6IGNhc2UgMjogY2FzZSAzOiBjYXNlIDQ6IGNhc2UgNTogY2FzZSA2OiBjYXNlIDc6XG4gICAgICAgICAgICAgICAgICAgIC8vIDB4eHh4eHh4XG4gICAgICAgICAgICAgICAgICAgIG91dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDEyOiBjYXNlIDEzOlxuICAgICAgICAgICAgICAgICAgICAvLyAxMTB4IHh4eHggICAxMHh4IHh4eHhcbiAgICAgICAgICAgICAgICAgICAgY2hhcjIgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSgoKGMgJiAweDFGKSA8PCA2KSB8IChjaGFyMiAmIDB4M0YpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxNDpcbiAgICAgICAgICAgICAgICAgICAgLy8gMTExMCB4eHh4ICAxMHh4IHh4eHggIDEweHggeHh4eFxuICAgICAgICAgICAgICAgICAgICBjaGFyMiA9IGFycmF5W2krK107XG4gICAgICAgICAgICAgICAgICAgIGNoYXIzID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgb3V0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoKChjICYgMHgwRikgPDwgMTIpIHxcbiAgICAgICAgICAgICAgICAgICAgICAgICgoY2hhcjIgJiAweDNGKSA8PCA2KSB8XG4gICAgICAgICAgICAgICAgICAgICAgICAoKGNoYXIzICYgMHgzRikgPDwgMCkpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IFR4eHhEYXRhLCBUeHh4RnJhbWUsIFRleHRGcmFtZSwgUHJpdkZyYW1lLCBJRDNGcmFtZSwgSUQzRGVjb2RlciB9IGZyb20gJy4vaWQzLWRlY29kZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIgfSBmcm9tICcuLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eElEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBUeHh4RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpdklEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBQcml2RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGV4dElEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBUZXh0RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUQzVGFnRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBJRDNGcmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTbGljZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBhc3NldElkOiBzdHJpbmc7XG4gICAgcmF5Q2hhcjogc3RyaW5nO1xuICAgIHNsaWNlSW5kZXg6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFdlYktpdFR4eHhDdWUge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGRhdGE6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFdlYktpdFByaXZDdWUge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGluZm86IHN0cmluZztcbiAgICBkYXRhOiBBcnJheUJ1ZmZlcjtcbn1cblxuZXhwb3J0IGNsYXNzIElEM0hhbmRsZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIHtcbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB2aWRlby50ZXh0VHJhY2tzLmFkZEV2ZW50TGlzdGVuZXIoJ2FkZHRyYWNrJywgdGhpcy5fb25BZGRUcmFjay5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkFkZFRyYWNrKGFkZFRyYWNrRXZlbnQ6IGFueSkge1xuICAgICAgICBsZXQgdHJhY2s6IFRleHRUcmFjayA9IGFkZFRyYWNrRXZlbnQudHJhY2s7XG4gICAgICAgIGlmICh0aGlzLl9pc0lkM01ldGFkYXRhVHJhY2sodHJhY2spKSB7XG4gICAgICAgICAgICB0cmFjay5tb2RlID0gJ2hpZGRlbic7XG4gICAgICAgICAgICB0cmFjay5hZGRFdmVudExpc3RlbmVyKCdjdWVjaGFuZ2UnLCB0aGlzLl9vbklEM0N1ZUNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2lzSWQzTWV0YWRhdGFUcmFjayh0cmFjazogVGV4dFRyYWNrKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0cmFjay5raW5kID09IFwibWV0YWRhdGFcIiAmJiB0cmFjay5sYWJlbCA9PSBcIklEM1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0cmFjay5raW5kID09IFwibWV0YWRhdGFcIiAmJiB0cmFjay5pbkJhbmRNZXRhZGF0YVRyYWNrRGlzcGF0Y2hUeXBlKSB7XG4gICAgICAgICAgICB2YXIgZGlzcGF0Y2hUeXBlID0gdHJhY2suaW5CYW5kTWV0YWRhdGFUcmFja0Rpc3BhdGNoVHlwZTtcbiAgICAgICAgICAgIHJldHVybiBkaXNwYXRjaFR5cGUgPT09IFwiY29tLmFwcGxlLnN0cmVhbWluZ1wiIHx8IGRpc3BhdGNoVHlwZSA9PT0gXCIxNTI2MERGRkZGNDk0NDMzMjBGRjQ5NDQzMzIwMDAwRlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzQ3VlQ2hhbmdlKGN1ZUNoYW5nZUV2ZW50OiBhbnkpIHtcbiAgICAgICAgbGV0IHRyYWNrID0gY3VlQ2hhbmdlRXZlbnQudGFyZ2V0O1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJhY2suYWN0aXZlQ3Vlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGN1ZSA9IHRyYWNrLmFjdGl2ZUN1ZXNbaV07XG4gICAgICAgICAgICBpZiAoIWN1ZS5vbmVudGVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25JRDNDdWUoY3VlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJhY2suY3Vlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGN1ZSA9IHRyYWNrLmN1ZXNbaV07XG4gICAgICAgICAgICBpZiAoIWN1ZS5vbmVudGVyKSB7XG4gICAgICAgICAgICAgICAgY3VlLm9uZW50ZXIgPSAoY3VlRXZlbnQ6IGFueSkgPT4geyB0aGlzLl9vbklEM0N1ZShjdWVFdmVudC50YXJnZXQpOyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNDdWUoY3VlOiBUZXh0VHJhY2tDdWUpIHtcbiAgICAgICAgbGV0IGRhdGE6IFVpbnQ4QXJyYXkgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBpZDNGcmFtZTogSUQzRnJhbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCB0eHh4RnJhbWU6IFR4eHhGcmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHRleHRGcmFtZTogVGV4dEZyYW1lID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgcHJpdkZyYW1lOiBQcml2RnJhbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCg8YW55PmN1ZSkuZGF0YSkge1xuICAgICAgICAgICAgLy9tcyBlZGdlIChuYXRpdmUpIHB1dHMgaWQzIGRhdGEgaW4gY3VlLmRhdGEgcHJvcGVydHlcbiAgICAgICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheSgoPGFueT5jdWUpLmRhdGEpO1xuICAgICAgICB9IGVsc2UgaWYgKCg8YW55PmN1ZSkudmFsdWUgJiYgKDxhbnk+Y3VlKS52YWx1ZS5rZXkgJiYgKDxhbnk+Y3VlKS52YWx1ZS5kYXRhKSB7XG5cbiAgICAgICAgICAgIC8vc2FmYXJpIChuYXRpdmUpIHB1dHMgaWQzIGRhdGEgaW4gV2ViS2l0RGF0YUN1ZSBvYmplY3RzLlxuICAgICAgICAgICAgLy8gbm8gZW5jb2RlZCBkYXRhIGF2YWlsYWJsZS4gc2FmYXJpIGRlY29kZXMgZnJhbWVzIG5hdGl2ZWx5XG4gICAgICAgICAgICAvLyBpLmUuXG4gICAgICAgICAgICAvLyB2YWx1ZToge2tleTogXCJUWFhYXCIsIGRhdGE6IFwiNmMzNTM3ZWMzMzI0NDYxNDlmMWQ1NGRkYmViZWE0MTRfaF8wMDAwMDE0MFwifVxuICAgICAgICAgICAgLy8gb3JcbiAgICAgICAgICAgIC8vIHZhbHVlOiB7a2V5OiBcIlBSSVZcIiwgaW5mbzogXCJjb20uZXNwbi5hdXRobmV0LmhlYXJ0YmVhdFwiLCBkYXRhOiBBcnJheUJ1ZmZlcn1cblxuICAgICAgICAgICAgaWYgKCg8YW55PmN1ZSkudmFsdWUua2V5ID09PSAnVFhYWCcpIHtcbiAgICAgICAgICAgICAgICBsZXQgdHh4eEN1ZTogV2ViS2l0VHh4eEN1ZSA9ICg8YW55PmN1ZSkudmFsdWU7XG4gICAgICAgICAgICAgICAgdHh4eEZyYW1lID0geyB2YWx1ZTogdHh4eEN1ZS5kYXRhLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCg8YW55PmN1ZSkudmFsdWUua2V5ID09PSAnUFJJVicpIHtcbiAgICAgICAgICAgICAgICBsZXQgcHJpdkN1ZTogV2ViS2l0UHJpdkN1ZSA9ICg8YW55PmN1ZSkudmFsdWU7XG4gICAgICAgICAgICAgICAgcHJpdkZyYW1lID0geyBvd25lcjogcHJpdkN1ZS5pbmZvLCBkYXRhOiBuZXcgVWludDhBcnJheShwcml2Q3VlLmRhdGEpIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL3VwbHluayBjcmVhdGVkIGlkMyBjdWVzXG4gICAgICAgICAgICBkYXRhID0gYmFzZTY0VG9CdWZmZXIoY3VlLnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGlkM0ZyYW1lID0gSUQzRGVjb2Rlci5nZXRGcmFtZShkYXRhKTtcbiAgICAgICAgICAgIGlmIChpZDNGcmFtZSkge1xuICAgICAgICAgICAgICAgIGlmIChpZDNGcmFtZS50eXBlID09PSAnVFhYWCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdHh4eEZyYW1lID0gSUQzRGVjb2Rlci5kZWNvZGVUeHh4RnJhbWUoaWQzRnJhbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQzRnJhbWUudHlwZSA9PT0gJ1BSSVYnKSB7XG4gICAgICAgICAgICAgICAgICAgIHByaXZGcmFtZSA9IElEM0RlY29kZXIuZGVjb2RlUHJpdkZyYW1lKGlkM0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlkM0ZyYW1lLnR5cGVbMF0gPT09ICdUJykge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0RnJhbWUgPSBJRDNEZWNvZGVyLmRlY29kZVRleHRGcmFtZShpZDNGcmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQ6IElEM1RhZ0V2ZW50ID0geyBjdWU6IGN1ZSwgZnJhbWU6IGlkM0ZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCBldmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHh4eEZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgdHh4eEV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiB0eHh4RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHR4eHhFdmVudCk7XG5cbiAgICAgICAgICAgIGlmICh0eHh4RnJhbWUudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2xpY2VEYXRhID0gdHh4eEZyYW1lLnZhbHVlLnNwbGl0KCdfJyk7XG4gICAgICAgICAgICAgICAgaWYgKHNsaWNlRGF0YS5sZW5ndGggPT0gMykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgc2xpY2VFdmVudDogU2xpY2VFdmVudCA9IHsgY3VlOiBjdWUsIGFzc2V0SWQ6IHNsaWNlRGF0YVswXSwgcmF5Q2hhcjogc2xpY2VEYXRhWzFdLCBzbGljZUluZGV4OiBwYXJzZUludChzbGljZURhdGFbMl0sIDE2KSB9O1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuU2xpY2VFbnRlcmVkLCBzbGljZUV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocHJpdkZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgcHJpdkV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiBwcml2RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHByaXZFdmVudCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGV4dEZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgdGV4dEV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiB0ZXh0RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5UZXh0SUQzRnJhbWUsIHRleHRFdmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgSUQzVGFnOiAnaWQzVGFnJyxcbiAgICAgICAgICAgIFR4eHhJRDNGcmFtZTogJ3R4eHhJZDNGcmFtZScsXG4gICAgICAgICAgICBQcml2SUQzRnJhbWU6ICdwcml2SWQzRnJhbWUnLFxuICAgICAgICAgICAgVGV4dElEM0ZyYW1lOiAndGV4dElkM0ZyYW1lJyxcbiAgICAgICAgICAgIFNsaWNlRW50ZXJlZDogJ3NsaWNlRW50ZXJlZCdcbiAgICAgICAgfTtcbiAgICB9XG59IiwiXG5leHBvcnQgY2xhc3MgTGljZW5zZU1hbmFnZXIge1xuXG4gICAgcmVhZG9ubHkgTElDRU5TRV9UWVBFX05PTkUgPSAwO1xuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9XSURFVklORSA9IDE7XG4gICAgcmVhZG9ubHkgTElDRU5TRV9UWVBFX1BMQVlSRUFEWSA9IDI7XG5cbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF9rZXlTZXJ2ZXJQcmVmaXg6IHN0cmluZztcbiAgICBwcml2YXRlIF9saWNlbnNlVHlwZSA9IDA7XG4gICAgcHJpdmF0ZSBfcHNzaDogVWludDhBcnJheTtcbiAgICBwcml2YXRlIF9tZWRpYUtleXM6IE1lZGlhS2V5cztcbiAgICBwcml2YXRlIF9wZW5kaW5nS2V5UmVxdWVzdHM6IHsgaW5pdERhdGFUeXBlOiBzdHJpbmcsIGluaXREYXRhOiBVaW50OEFycmF5IH1bXTtcblxuXG4gICAgcHVibGljIHBsYXlSZWFkeUtleVN5c3RlbSA9IHtcbiAgICAgICAga2V5U3lzdGVtOiAnY29tLm1pY3Jvc29mdC5wbGF5cmVhZHknLFxuICAgICAgICBzdXBwb3J0ZWRDb25maWc6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpbml0RGF0YVR5cGVzOiBbJ2tleWlkcycsICdjZW5jJ10sXG4gICAgICAgICAgICAgICAgYXVkaW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ2F1ZGlvL21wNDsgY29kZWNzPVwibXA0YVwiJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvYnVzdG5lc3M6ICcnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHZpZGVvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzFcIicsXG4gICAgICAgICAgICAgICAgICAgICAgICByb2J1c3RuZXNzOiAnJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfTtcblxuICAgIHB1YmxpYyB3aWRldmluZUtleVN5c3RlbSA9IHtcbiAgICAgICAga2V5U3lzdGVtOiAnY29tLndpZGV2aW5lLmFscGhhJyxcbiAgICAgICAgc3VwcG9ydGVkQ29uZmlnOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGFiZWw6ICdmb28nLFxuICAgICAgICAgICAgICAgIGluaXREYXRhVHlwZXM6IFsnY2VuYyddLFxuICAgICAgICAgICAgICAgIHNlc3Npb25UeXBlczogWyd0ZW1wb3JhcnknXSxcbiAgICAgICAgICAgICAgICBhdWRpb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICdhdWRpby9tcDQ7IGNvZGVjcz1cIm1wNGEuNDAuNVwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9DUllQVE8nIH1cbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHZpZGVvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgLy8gcm9idXN0bmVzcyBIV19TRUNVUkVfQUxMLCBIV19TRUNVUkVfREVDT0RFLCBIV19TRUNVUkVfQ1JZUFRPLCBTV19TRUNVUkVfREVDT0RFLCBTV19TRUNVUkVfQ1JZUFRPXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfREVDT0RFJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxZlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9DUllQVE8nIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0RFQ09ERScgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFlXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxNlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDE2XCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyMDAwZFwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9DUllQVE8nIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBjXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGNcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyMDAwYlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBiXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW8gOiBIVE1MVmlkZW9FbGVtZW50KSB7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiTGljZW5zZU1hbmFnZXIgQ1RPUlwiKTtcbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5fa2V5U2VydmVyUHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fcHNzaCA9IG51bGw7XG4gICAgICAgIHRoaXMuX21lZGlhS2V5cyA9IG51bGw7XG4gICAgICAgIHRoaXMuX3BlbmRpbmdLZXlSZXF1ZXN0cyA9IFtdO1xuICAgICAgICB0aGlzLmluaXRNZWRpYUtleXMoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkTGljZW5zZVJlcXVlc3QocHNzaERhdGE6IFVpbnQ4QXJyYXkpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciAtIFJlcXVlc3RpbmcgbGljZW5zZSBmb3IgRFJNIHBsYXliYWNrXCIpO1xuICAgICAgICB0aGlzLl9wZW5kaW5nS2V5UmVxdWVzdHMucHVzaCh7IGluaXREYXRhVHlwZTogJ2NlbmMnLCBpbml0RGF0YTogcHNzaERhdGEgfSk7XG4gICAgICAgIHRoaXMucHJvY2Vzc1BlbmRpbmdLZXlzKHRoaXMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRLZXlTZXJ2ZXJQcmVmaXgoa2V5U2VydmVyUHJlZml4OiBzdHJpbmcpIHtcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJLZXlTZXJ2ZXJQcmVmaXg6IFwiICsga2V5U2VydmVyUHJlZml4KTtcbiAgICAgICAgdGhpcy5fa2V5U2VydmVyUHJlZml4ID0ga2V5U2VydmVyUHJlZml4O1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5pdE1lZGlhS2V5cygpIHtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLl9tZWRpYUtleXMgPSBudWxsO1xuXG4gICAgICAgIC8vIFRyeSBXaWRldmluZS5cbiAgICAgICAgbmF2aWdhdG9yLnJlcXVlc3RNZWRpYUtleVN5c3RlbUFjY2VzcyhzZWxmLndpZGV2aW5lS2V5U3lzdGVtLmtleVN5c3RlbSwgc2VsZi53aWRldmluZUtleVN5c3RlbS5zdXBwb3J0ZWRDb25maWcpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoa2V5U3lzdGVtQWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fbGljZW5zZVR5cGUgPSBzZWxmLkxJQ0VOU0VfVFlQRV9XSURFVklORTtcblxuICAgICAgICAgICAgICAgIGtleVN5c3RlbUFjY2Vzcy5jcmVhdGVNZWRpYUtleXMoKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoY3JlYXRlZE1lZGlhS2V5cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5vbk1lZGlhS2V5QWNxdWlyZWQoc2VsZiwgY3JlYXRlZE1lZGlhS2V5cyk7XG4gICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBjcmVhdGVNZWRpYUtleXMoKSBmYWlsZWQgZm9yIFdpZGVWaW5lJylcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nKCdMaWNlbnNlTWFuYWdlciAtIFlvdXIgYnJvd3Nlci9zeXN0ZW0gZG9lcyBub3Qgc3VwcG9ydCB0aGUgcmVxdWVzdGVkIGNvbmZpZ3VyYXRpb25zIGZvciBwbGF5aW5nIFdpZGVWaW5lIHByb3RlY3RlZCBjb250ZW50LicpOyB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uTWVkaWFLZXlBY3F1aXJlZChzZWxmOiBMaWNlbnNlTWFuYWdlciwgY3JlYXRlZE1lZGlhS2V5czogTWVkaWFLZXlzKSB7XG4gICAgICAgIHNlbGYuX21lZGlhS2V5cyA9IGNyZWF0ZWRNZWRpYUtleXM7XG4gICAgICAgIHNlbGYuX3ZpZGVvLnNldE1lZGlhS2V5cyhzZWxmLl9tZWRpYUtleXMpO1xuICAgICAgICBzZWxmLnByb2Nlc3NQZW5kaW5nS2V5cyhzZWxmKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHByb2Nlc3NQZW5kaW5nS2V5cyhzZWxmOiBMaWNlbnNlTWFuYWdlcikge1xuICAgICAgICBpZiAoc2VsZi5fbWVkaWFLZXlzID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGxldCBkYXRhID0gc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLnNoaWZ0KCk7IC8vIHBvcCBmaXJzdCBlbGVtZW50XG4gICAgICAgICAgICBzZWxmLmdldE5ld0tleVNlc3Npb24oZGF0YS5pbml0RGF0YVR5cGUsIGRhdGEuaW5pdERhdGEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXROZXdLZXlTZXNzaW9uKCBpbml0RGF0YVR5cGU6IHN0cmluZywgaW5pdERhdGE6IFVpbnQ4QXJyYXkpIHtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICBsZXQga2V5U2Vzc2lvbiA9IHNlbGYuX21lZGlhS2V5cy5jcmVhdGVTZXNzaW9uKFwidGVtcG9yYXJ5XCIpO1xuICAgICAgICBrZXlTZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXZlbnQ6IE1lZGlhS2V5TWVzc2FnZUV2ZW50KSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdvbm1lc3NhZ2UgLCBtZXNzYWdlIHR5cGU6ICcgKyBldmVudC5tZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHNlbGYuZG93bmxvYWROZXdLZXkoc2VsZi5nZXRMaWNlbnNlVXJsKCksIGV2ZW50Lm1lc3NhZ2UsIGZ1bmN0aW9uIChkYXRhOiBBcnJheUJ1ZmZlcikge1xuICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ2V2ZW50LnRhcmdldC51cGRhdGUsIGRhdGEgYnl0ZXM6ICcgKyBkYXRhLmJ5dGVMZW5ndGgpO1xuICAgICAgICAgICAgICAgIHZhciBwcm9tID0gPFByb21pc2U8dm9pZD4+ICg8TWVkaWFLZXlTZXNzaW9uPmV2ZW50LnRhcmdldCkudXBkYXRlKGRhdGEpO1xuICAgICAgICAgICAgICAgIHByb20uY2F0Y2goZnVuY3Rpb24gKGU6IHN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBjYWxsIHRvIE1lZGlhS2V5U2Vzc2lvbi51cGRhdGUoKSBmYWlsZWQnICsgZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciAtIGZpbmlzaGVkIGxpY2Vuc2UgdXBkYXRlIGZvciBEUk0gcGxheWJhY2tcIik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgIGxldCByZXFQcm9taXNlID0gPFByb21pc2U8dm9pZD4+IGtleVNlc3Npb24uZ2VuZXJhdGVSZXF1ZXN0KGluaXREYXRhVHlwZSwgaW5pdERhdGEpO1xuICAgICAgICByZXFQcm9taXNlLmNhdGNoKGZ1bmN0aW9uIChlIDogc3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBrZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdCgpIGZhaWxlZDogJyArIGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldExpY2Vuc2VVcmwoKSB7XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fa2V5U2VydmVyUHJlZml4ICsgXCIvcHJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggKyBcIi93dlwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvd25sb2FkTmV3S2V5KHVybCA6IHN0cmluZywga2V5TWVzc2FnZTogQXJyYXlCdWZmZXIsIGNhbGxiYWNrOiBhbnkpIHsgXG4gICAgICAgIC8vY29uc29sZS5sb2coJ2Rvd25sb2FkTmV3S2V5ICh4aHIpOiAnICsgdXJsKTtcbiAgICAgICAgbGV0IGNoYWxsZW5nZSA6IEFycmF5QnVmZmVyO1xuICAgICAgICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIHhoci5vcGVuKCdQT1NUJywgdXJsLCB0cnVlKTtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWU7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh4aHIucmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdMaWNlbnNlTWFuYWdlciAtIFhIUiBmYWlsZWQgKCcgKyB1cmwgKyAnKS4gU3RhdHVzOiAnICsgeGhyLnN0YXR1cyArICcgKCcgKyB4aHIuc3RhdHVzVGV4dCArICcpJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICAvLyAvLyBGb3IgUGxheVJlYWR5IENETXMsIHdlIG5lZWQgdG8gZGlnIHRoZSBDaGFsbGVuZ2Ugb3V0IG9mIHRoZSBYTUwuXG4gICAgICAgICAgICAvLyB2YXIga2V5TWVzc2FnZVhtbCA9IG5ldyBET01QYXJzZXIoKS5wYXJzZUZyb21TdHJpbmcoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDE2QXJyYXkoa2V5TWVzc2FnZSkpLCAnYXBwbGljYXRpb24veG1sJyk7XG4gICAgICAgICAgICAvLyBpZiAoa2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnQ2hhbGxlbmdlJylbMF0pIHtcbiAgICAgICAgICAgIC8vICAgICBjaGFsbGVuZ2UgPSBhdG9iKGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ0NoYWxsZW5nZScpWzBdLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlKTtcbiAgICAgICAgICAgIC8vIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyAgICAgdGhyb3cgJ0Nhbm5vdCBmaW5kIDxDaGFsbGVuZ2U+IGluIGtleSBtZXNzYWdlJztcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIC8vIHZhciBoZWFkZXJOYW1lcyA9IGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ25hbWUnKTtcbiAgICAgICAgICAgIC8vIHZhciBoZWFkZXJWYWx1ZXMgPSBrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCd2YWx1ZScpO1xuICAgICAgICAgICAgLy8gaWYgKGhlYWRlck5hbWVzLmxlbmd0aCAhPT0gaGVhZGVyVmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgLy8gICAgIHRocm93ICdNaXNtYXRjaGVkIGhlYWRlciA8bmFtZT4vPHZhbHVlPiBwYWlyIGluIGtleSBtZXNzYWdlJztcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIC8vIGZvciAodmFyIGkgPSAwOyBpIDwgaGVhZGVyTmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIC8vICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihoZWFkZXJOYW1lc1tpXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSwgaGVhZGVyVmFsdWVzW2ldLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlKTtcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpe1xuICAgICAgICAgICAgLy8gRm9yIFdpZGV2aW5lIENETXMsIHRoZSBjaGFsbGVuZ2UgaXMgdGhlIGtleU1lc3NhZ2UuXG4gICAgICAgICAgICBjaGFsbGVuZ2UgPSBrZXlNZXNzYWdlO1xuICAgICAgICB9XG5cbiAgICAgICAgeGhyLnNlbmQoY2hhbGxlbmdlKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAnLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IEV2ZW50cyB9IGZyb20gJy4vZXZlbnRzJztcbmltcG9ydCB7IFBsYXllciwgUmVzb2x1dGlvbiwgTWltZVR5cGUgfSBmcm9tICcuL3BsYXllcic7XG5pbXBvcnQgKiBhcyB0aHVtYiBmcm9tICcuL3V0aWxzL3RodW1ibmFpbC1oZWxwZXInO1xuaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4vdXRpbHMvc2VnbWVudC1tYXAnO1xuaW1wb3J0IHsgQWRCcmVhayB9IGZyb20gJy4vYWQvYWQtYnJlYWsnO1xuaW1wb3J0IHsgSUQzSGFuZGxlciwgSUQzVGFnRXZlbnQsIFR4eHhJRDNGcmFtZUV2ZW50LCBQcml2SUQzRnJhbWVFdmVudCwgVGV4dElEM0ZyYW1lRXZlbnQsIFNsaWNlRXZlbnQgfSBmcm9tICcuL2lkMy9pZDMtaGFuZGxlcic7XG5pbXBvcnQgeyBJRDNEYXRhIH0gZnJvbSAnLi9pZDMvaWQzLWRhdGEnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVBsYXllciBleHRlbmRzIE9ic2VydmFibGUgaW1wbGVtZW50cyBQbGF5ZXIge1xuICAgIHByaXZhdGUgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuICAgIHByaXZhdGUgX3VybDogc3RyaW5nO1xuICAgIHByaXZhdGUgX3BsYXlsaXN0VHlwZTogXCJWT0RcIiB8IFwiRVZFTlRcIiB8IFwiTElWRVwiO1xuICAgIHByaXZhdGUgX2lkM0hhbmRsZXI6IElEM0hhbmRsZXI7XG4gICAgcHJpdmF0ZSBfZmlyZWRSZWFkeUV2ZW50OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2Fzc2V0SW5mb1NlcnZpY2U6IEFzc2V0SW5mb1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfcGluZ1NlcnZpY2U6IFBpbmdTZXJ2aWNlO1xuICAgIHByaXZhdGUgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgX2N1cnJlbnRBc3NldElkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfY29uZmlnOiBQbGF5ZXJPcHRpb25zO1xuICAgIHByaXZhdGUgX2luQWRCcmVhazogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9jdXJyZW50QWRCcmVhazogQWRCcmVhaztcblxuICAgIC8vZG8gbm90aGluZyBwcm9wZXJ0aWVzXG4gICAgcmVhZG9ubHkgbnVtYmVyT2ZSYXlzOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlQmFuZHdpZHRoczogbnVtYmVyW107XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlUmVzb2x1dGlvbnM6IFJlc29sdXRpb25bXTtcbiAgICByZWFkb25seSBhdmFpbGFibGVNaW1lVHlwZXM6IE1pbWVUeXBlW107XG4gICAgcmVhZG9ubHkgc2VnbWVudE1hcDogU2VnbWVudE1hcDtcbiAgICByZWFkb25seSBhZEJyZWFrczogQWRCcmVha1tdO1xuICAgIHJlYWRvbmx5IGlzQXVkaW9Pbmx5OiBib29sZWFuO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZVxuICAgIH07XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCwgb3B0aW9ucz86IFBsYXllck9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICAvL2luaXQgY29uZmlnXG4gICAgICAgIHZhciBkYXRhID0ge307XG5cbiAgICAgICAgLy90cnkgcGFyc2luZyBkYXRhIGF0dHJpYnV0ZSBjb25maWdcbiAgICAgICAgdHJ5IHsgZGF0YSA9IEpTT04ucGFyc2UodmlkZW8uZ2V0QXR0cmlidXRlKCdkYXRhLWNvbmZpZycpKTsgfVxuICAgICAgICBjYXRjaCAoZSkgeyB9XG5cbiAgICAgICAgLy9tZXJnZSBkZWZhdWx0cyB3aXRoIHVzZXIgb3B0aW9uc1xuICAgICAgICB0aGlzLl9jb25maWcgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9kZWZhdWx0cywgb3B0aW9ucywgZGF0YSk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlciA9IG5ldyBJRDNIYW5kbGVyKHZpZGVvKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LklEM1RhZywgdGhpcy5fb25JRDNUYWcuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHRoaXMuX29uVHh4eElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuUHJpdklEM0ZyYW1lLCB0aGlzLl9vblByaXZJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlRleHRJRDNGcmFtZSwgdGhpcy5fb25UZXh0SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5TbGljZUVudGVyZWQsIHRoaXMuX29uU2xpY2VFbnRlcmVkLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UgPSB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlLmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5fb3ZlcnJpZGVDdXJyZW50VGltZSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBsb2FkKHVybDogc3RyaW5nKTogdm9pZCB7XG5cbiAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRBc3NldElkID0gbnVsbDtcblxuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdkdXJhdGlvbmNoYW5nZScsIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdkdXJhdGlvbmNoYW5nZScsIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UpO1xuXG4gICAgICAgIC8vc2Vzc2lvbklkICg/cGJzPSkgbWF5IG9yIG1heSBub3QgYmUgcGFydCBvZiB0aGUgdXJsXG4gICAgICAgIHRoaXMuX3Nlc3Npb25JZCA9IHRoaXMuX2dldFNlc3Npb25JZCh1cmwpO1xuICAgICAgICB0aGlzLl9kb21haW4gPSB0aGlzLl9nZXREb21haW4odXJsKTtcblxuICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlID0gbmV3IEFzc2V0SW5mb1NlcnZpY2UodGhpcy5kb21haW4pO1xuXG4gICAgICAgIC8vY2FuJ3QgdXNlICdjb250ZW50LnVwbHluay5jb20nIGFzIGEgZG9tYWluIG5hbWUgYmVjYXVzZSBzZXNzaW9uIGRhdGEgbGl2ZXNcbiAgICAgICAgLy8gaW5zaWRlIGEgc3BlY2lmaWMgZG9tYWluXG4gICAgICAgIGlmKHRoaXMuX2RvbWFpbiAhPT0gJ2NvbnRlbnQudXBseW5rLmNvbScpIHtcbiAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2aWNlID0gbmV3IFBpbmdTZXJ2aWNlKHRoaXMuZG9tYWluLCB0aGlzLl9zZXNzaW9uSWQsIHRoaXMuX3ZpZGVvKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3VybCA9IHVybDtcbiAgICAgICAgdGhpcy5fdmlkZW8uc3JjID0gdXJsO1xuICAgICAgICB0aGlzLl92aWRlby5sb2FkKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb3ZlcnJpZGVDdXJyZW50VGltZSgpOiB2b2lkIHtcbiAgICAgICAgLy9vdmVycmlkZSAnY3VycmVudFRpbWUnIHByb3BlcnR5IHNvIHdlIGNhbiBwcmV2ZW50IFxuICAgICAgICAvLyB1c2VycyBmcm9tIHNldHRpbmcgdmlkZW8uY3VycmVudFRpbWUsIGFsbG93aW5nIHRoZW1cbiAgICAgICAgLy8gdG8gc2tpcCBhZHMuXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpO1xuICAgICAgICBpZiAoY3VycmVudFRpbWVEZXNjcmlwdG9yKSB7XG4gICAgICAgICAgICBjb25zdCBnZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lRGVzY3JpcHRvci5nZXQ7XG4gICAgICAgICAgICBjb25zdCBzZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lRGVzY3JpcHRvci5zZXQ7XG5cbiAgICAgICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMuX3ZpZGVvLCAnY3VycmVudFRpbWUnLCB7XG4gICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXRDdXJyZW50VGltZS5hcHBseSh0aGlzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBpZihzZWxmLmNhblNlZWsoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcywgW3ZhbF0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWsgZ2l2ZW4gaXQncyBjdXJyZW50IHBvc2l0aW9uIGFuZFxuICAgICAqIHdldGhlciBvciBub3QgaXQncyBpbiBhbiBhZCBicmVhay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWssIG90aGVyd2lzZSBmYWxzZS5cbiAgICAgKi9cbiAgICBjYW5TZWVrKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoIXRoaXMuX2NvbmZpZy5kaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICF0aGlzLl9pbkFkQnJlYWs7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZ2V0U2Vzc2lvbklkKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgLy9odHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS81MTU4MzAxXG4gICAgICAgIHZhciBtYXRjaCA9IFJlZ0V4cCgnWz8mXXBicz0oW14mXSopJykuZXhlYyh1cmwpO1xuICAgICAgICByZXR1cm4gbWF0Y2ggJiYgZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnJlcGxhY2UoL1xcKy9nLCAnICcpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXREb21haW4odXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICB2YXIgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgbGluay5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCB1cmwpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGxpbmsuaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25EdXJhdGlvbkNoYW5nZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX3ZpZGVvLmR1cmF0aW9uID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RUeXBlID0gJ0xJVkUnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RUeXBlID0gJ1ZPRCc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2ZpcmVkUmVhZHlFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlJlYWR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfVxuXG4gICAgcHVibGljIHNldEJyb3dzZXIoc2FmYXJpOiBib29sZWFuLCBpZTogYm9vbGVhbiwgY2hyb21lOiBib29sZWFuLCBmaXJlZm94OiBib29sZWFuKSB7XG4gICAgICAgIC8vZG8gbm90aGluZ1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzaXplOiBcInNtYWxsXCIgfCBcImxhcmdlXCIpOiB0aHVtYi5UaHVtYm5haWwge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGRvbWFpbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fZG9tYWluO1xuICAgIH1cblxuICAgIGdldCBzZXNzaW9uSWQoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Nlc3Npb25JZDtcbiAgICB9XG5cbiAgICBnZXQgcGxheWxpc3RUeXBlKCk6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5bGlzdFR5cGU7XG4gICAgfVxuXG4gICAgZ2V0IGR1cmF0aW9uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5kdXJhdGlvbjtcbiAgICB9XG5cbiAgICBnZXQgc3VwcG9ydHNUaHVtYm5haWxzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ05hdGl2ZVBsYXllcic7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNUYWcoZXZlbnQ6IElEM1RhZ0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLklEM1RhZywgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVHh4eElEM0ZyYW1lKGV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UeHh4SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblByaXZJRDNGcmFtZShldmVudDogUHJpdklEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuUHJpdklEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UZXh0SUQzRnJhbWUoZXZlbnQ6IFRleHRJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlRleHRJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2xpY2VFbnRlcmVkKGV2ZW50OiBTbGljZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNsaWNlRW50ZXJlZCwgZXZlbnQpO1xuXG4gICAgICAgIGlmICh0aGlzLl9jdXJyZW50QXNzZXRJZCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgLy9maXJzdCBhc3NldCBpZCBlbmNvdW50ZXJlZFxuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZChldmVudC5hc3NldElkLCBudWxsLCAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jdXJyZW50QXNzZXRJZCA9IGV2ZW50LmFzc2V0SWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25Bc3NldEVuY291bnRlcmVkKGV2ZW50LmN1ZSwgYXNzZXRJbmZvKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRBc3NldElkICE9PSBldmVudC5hc3NldElkKSB7XG4gICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRBc3NldElkKHRoaXMuX2N1cnJlbnRBc3NldElkLCBudWxsLCAoY3VycmVudEFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZChldmVudC5hc3NldElkLCBudWxsLCAobmV3QXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudEFzc2V0SWQgPSBldmVudC5hc3NldElkO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9vbk5ld0Fzc2V0RW5jb3VudGVyZWQoZXZlbnQuY3VlLCBjdXJyZW50QXNzZXRJbmZvLCBuZXdBc3NldEluZm8pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL3NhbWUgYXNzZXQgaWQgYXMgcHJldmlvdXMgb25lLCBkbyBub3RoaW5nXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkFzc2V0RW5jb3VudGVyZWQoY3VlOiBUZXh0VHJhY2tDdWUsIGFzc2V0SW5mbzogQXNzZXRJbmZvKTogdm9pZCB7XG4gICAgICAgIGxldCBzZWdtZW50OiBTZWdtZW50ID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmIChhc3NldEluZm8uaXNBZCkge1xuICAgICAgICAgICAgc2VnbWVudCA9IHtcbiAgICAgICAgICAgICAgICBpZDogYXNzZXRJbmZvLmFzc2V0LFxuICAgICAgICAgICAgICAgIGluZGV4OiAwLFxuICAgICAgICAgICAgICAgIHN0YXJ0VGltZTogY3VlLnN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBlbmRUaW1lOiBjdWUuc3RhcnRUaW1lICsgYXNzZXRJbmZvLmR1cmF0aW9uLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdBRCdcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGxldCBzZWdtZW50czogU2VnbWVudFtdID0gW3NlZ21lbnRdO1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudEFkQnJlYWsgPSBuZXcgQWRCcmVhayhzZWdtZW50cyk7XG4gICAgICAgICAgICB0aGlzLl9pbkFkQnJlYWsgPSB0cnVlO1xuXG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFbnRlcmVkLCB7IGFkQnJlYWs6IHRoaXMuX2N1cnJlbnRBZEJyZWFrIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vZG9uJ3QgaGF2ZSBhIHNlZ21lbnQgdG8gcGFzcyBhbG9uZyBiZWNhdXNlIHdlIGRvbid0IGtub3cgdGhlIGR1cmF0aW9uIG9mIHRoaXMgYXNzZXRcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiB1bmRlZmluZWQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbk5ld0Fzc2V0RW5jb3VudGVyZWQoY3VlOiBUZXh0VHJhY2tDdWUsIHByZXZpb3VzQXNzZXQ6IEFzc2V0SW5mbywgbmV3QXNzZXQ6IEFzc2V0SW5mbyk6IHZvaWQge1xuICAgICAgICAvL3dpbGwgd2Ugc3RpbGwgYmUgaW4gYW4gYWQgYnJlYWsgYWZ0ZXIgdGhpcyBhc3NldD9cbiAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gbmV3QXNzZXQuaXNBZDtcblxuICAgICAgICBpZiAocHJldmlvdXNBc3NldC5pc0FkICYmIHRoaXMuX2N1cnJlbnRBZEJyZWFrKSB7XG4gICAgICAgICAgICAvL2xlYXZpbmcgYWQgYnJlYWtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHRoaXMuX2N1cnJlbnRBZEJyZWFrLmdldFNlZ21lbnRBdCgwKSwgYXNzZXQ6IHByZXZpb3VzQXNzZXQgfSk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRXhpdGVkLCB7IGFkQnJlYWs6IHRoaXMuX2N1cnJlbnRBZEJyZWFrIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9kb24ndCBoYXZlIGEgc2VnbWVudCB0byBwYXNzIGFsb25nIGJlY2F1c2Ugd2UgZG9uJ3Qga25vdyB0aGUgZHVyYXRpb24gb2YgdGhpcyBhc3NldFxuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFeGl0ZWQsIHsgc2VnbWVudDogdW5kZWZpbmVkLCBhc3NldDogcHJldmlvdXNBc3NldCB9KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy5fb25Bc3NldEVuY291bnRlcmVkKGN1ZSwgbmV3QXNzZXQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudDogVHJhY2tFdmVudCk6IHZvaWQge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICB9XG5cbiAgICBnZXQgdmVyc2lvbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJzAyLjAwLjE3MDkyMTAwJzsgLy93aWxsIGJlIG1vZGlmaWVkIGJ5IHRoZSBidWlsZCBzY3JpcHRcbiAgICB9XG59IiwiXG4vL3BvbHlmaWxsIEFycmF5LmZpbmQoKVxuLy9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9maW5kXG4vLyBodHRwczovL3RjMzkuZ2l0aHViLmlvL2VjbWEyNjIvI3NlYy1hcnJheS5wcm90b3R5cGUuZmluZFxuaWYgKCFBcnJheS5wcm90b3R5cGUuZmluZCkge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQXJyYXkucHJvdG90eXBlLCAnZmluZCcsIHtcbiAgICB2YWx1ZTogZnVuY3Rpb24ocHJlZGljYXRlOmFueSkge1xuICAgICAvLyAxLiBMZXQgTyBiZSA/IFRvT2JqZWN0KHRoaXMgdmFsdWUpLlxuICAgICAgaWYgKHRoaXMgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdcInRoaXNcIiBpcyBudWxsIG9yIG5vdCBkZWZpbmVkJyk7XG4gICAgICB9XG5cbiAgICAgIHZhciBvID0gT2JqZWN0KHRoaXMpO1xuXG4gICAgICAvLyAyLiBMZXQgbGVuIGJlID8gVG9MZW5ndGgoPyBHZXQoTywgXCJsZW5ndGhcIikpLlxuICAgICAgdmFyIGxlbiA9IG8ubGVuZ3RoID4+PiAwO1xuXG4gICAgICAvLyAzLiBJZiBJc0NhbGxhYmxlKHByZWRpY2F0ZSkgaXMgZmFsc2UsIHRocm93IGEgVHlwZUVycm9yIGV4Y2VwdGlvbi5cbiAgICAgIGlmICh0eXBlb2YgcHJlZGljYXRlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWRpY2F0ZSBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIH1cblxuICAgICAgLy8gNC4gSWYgdGhpc0FyZyB3YXMgc3VwcGxpZWQsIGxldCBUIGJlIHRoaXNBcmc7IGVsc2UgbGV0IFQgYmUgdW5kZWZpbmVkLlxuICAgICAgdmFyIHRoaXNBcmcgPSBhcmd1bWVudHNbMV07XG5cbiAgICAgIC8vIDUuIExldCBrIGJlIDAuXG4gICAgICB2YXIgayA9IDA7XG5cbiAgICAgIC8vIDYuIFJlcGVhdCwgd2hpbGUgayA8IGxlblxuICAgICAgd2hpbGUgKGsgPCBsZW4pIHtcbiAgICAgICAgLy8gYS4gTGV0IFBrIGJlICEgVG9TdHJpbmcoaykuXG4gICAgICAgIC8vIGIuIExldCBrVmFsdWUgYmUgPyBHZXQoTywgUGspLlxuICAgICAgICAvLyBjLiBMZXQgdGVzdFJlc3VsdCBiZSBUb0Jvb2xlYW4oPyBDYWxsKHByZWRpY2F0ZSwgVCwgwqsga1ZhbHVlLCBrLCBPIMK7KSkuXG4gICAgICAgIC8vIGQuIElmIHRlc3RSZXN1bHQgaXMgdHJ1ZSwgcmV0dXJuIGtWYWx1ZS5cbiAgICAgICAgdmFyIGtWYWx1ZSA9IG9ba107XG4gICAgICAgIGlmIChwcmVkaWNhdGUuY2FsbCh0aGlzQXJnLCBrVmFsdWUsIGssIG8pKSB7XG4gICAgICAgICAgcmV0dXJuIGtWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBlLiBJbmNyZWFzZSBrIGJ5IDEuXG4gICAgICAgIGsrKztcbiAgICAgIH1cblxuICAgICAgLy8gNy4gUmV0dXJuIHVuZGVmaW5lZC5cbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9KTtcbn0iLCJcbi8vcG9seWZpbGwgZm9yIE9iamVjdC5hc3NpZ24oKSBmb3IgSUUxMVxuLy9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3QvYXNzaWduXG5pZiAodHlwZW9mIE9iamVjdC5hc3NpZ24gIT0gJ2Z1bmN0aW9uJykge1xuICAoZnVuY3Rpb24gKCkge1xuICAgIE9iamVjdC5hc3NpZ24gPSBmdW5jdGlvbiAodGFyZ2V0OiBhbnkpIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcbiAgICAgIC8vIFdlIG11c3QgY2hlY2sgYWdhaW5zdCB0aGVzZSBzcGVjaWZpYyBjYXNlcy5cbiAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCB8fCB0YXJnZXQgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ2Fubm90IGNvbnZlcnQgdW5kZWZpbmVkIG9yIG51bGwgdG8gb2JqZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIHZhciBvdXRwdXQgPSBPYmplY3QodGFyZ2V0KTtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBhcmd1bWVudHMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmd1bWVudHNbaW5kZXhdO1xuICAgICAgICBpZiAoc291cmNlICE9PSB1bmRlZmluZWQgJiYgc291cmNlICE9PSBudWxsKSB7XG4gICAgICAgICAgZm9yICh2YXIgbmV4dEtleSBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIGlmIChzb3VyY2UuaGFzT3duUHJvcGVydHkobmV4dEtleSkpIHtcbiAgICAgICAgICAgICAgb3V0cHV0W25leHRLZXldID0gc291cmNlW25leHRLZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG91dHB1dDtcbiAgICB9O1xuICB9KSgpO1xufSIsIlxuLy9wb2x5ZmlsbCBmb3IgVlRUQ3VlIGZvciBNUyBFZGdlIGFuZCBJRTExXG4oZnVuY3Rpb24gKCkge1xuICAgICg8YW55PndpbmRvdykuVlRUQ3VlID0gKDxhbnk+d2luZG93KS5WVFRDdWUgfHwgKDxhbnk+d2luZG93KS5UZXh0VHJhY2tDdWU7XG59KSgpO1xuIiwiaW1wb3J0ICcuL3BvbHlmaWxsL3Z0dC1jdWUnO1xuaW1wb3J0ICcuL3BvbHlmaWxsL29iamVjdCc7XG5pbXBvcnQgJy4vcG9seWZpbGwvYXJyYXknO1xuaW1wb3J0IHsgUGxheWVyIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0IHsgQWRhcHRpdmVQbGF5ZXIgfSBmcm9tICcuL2FkYXB0aXZlLXBsYXllcic7XG5pbXBvcnQgeyBOYXRpdmVQbGF5ZXIgfSBmcm9tICcuL25hdGl2ZS1wbGF5ZXInO1xuXG5cbmZ1bmN0aW9uIGlzTmF0aXZlUGxheWJhY2tTdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgICAgbGV0IHZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcblxuICAgICAgICBpZiAodmlkZW8uY2FuUGxheVR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB2aWRlby5jYW5QbGF5VHlwZSgnYXBwbGljYXRpb24vdm5kLmFwcGxlLm1wZWd1cmwnKSAhPT0gJyc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuICAgIGlmICgnTWVkaWFTb3VyY2UnIGluIHdpbmRvdyAmJiBNZWRpYVNvdXJjZS5pc1R5cGVTdXBwb3J0ZWQpIHtcbiAgICAgICAgcmV0dXJuIE1lZGlhU291cmNlLmlzVHlwZVN1cHBvcnRlZCgndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyRTAxRSxtcDRhLjQwLjJcIicpO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gY3VycmVudFNjcmlwdCgpIHtcbiAgICAvL2hhY2t5LCBidXQgd29ya3MgZm9yIG91ciBuZWVkc1xuICAgIGNvbnN0IHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0Jyk7XG4gICAgaWYgKHNjcmlwdHMgJiYgc2NyaXB0cy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY3JpcHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc2NyaXB0c1tpXS5zcmMuaW5kZXhPZigndXBseW5rLWNvcmUuanMnKSA+IC0xIHx8IHNjcmlwdHNbaV0uc3JjLmluZGV4T2YoJ3VwbHluay1jb3JlLm1pbi5qcycpID4gLTEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NyaXB0c1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbnZhciBsb2FkZWRVcGx5bmtBZGFwdGl2ZSA9IHRydWU7XG5cbmZ1bmN0aW9uIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCwgb3B0aW9ucz86IFBsYXllck9wdGlvbnMsIGNhbGxiYWNrPzogKHBsYXllcjogUGxheWVyKSA9PiB2b2lkKSB7XG5cbiAgICAvL2xvYWQgdXBseW5rLWFkYXB0aXZlLmpzXG4gICAgbGV0IHVybCA9IGN1cnJlbnRTY3JpcHQoKS5zcmMuc3Vic3RyaW5nKDAsIGN1cnJlbnRTY3JpcHQoKS5zcmMubGFzdEluZGV4T2YoJy8nKSArIDEpICsgJ3VwbHluay1hZGFwdGl2ZS5qcyc7XG5cbiAgICAvLyBpZiB1c2luZyBXZWJBc3NlbWJseSwgdGhlIHdhc20gaXMgYWxyZWFkeSBsb2FkZWQgZnJvbSB0aGUgaHRtbFxuICAgIGxldCBlbmFibGVXQVNNID0gZmFsc2U7XG4gICAgaWYgKGVuYWJsZVdBU00gJiYgdHlwZW9mIFdlYkFzc2VtYmx5ID09PSAnb2JqZWN0Jykge1xuICAgICAgICBjYWxsYmFjayhuZXcgQWRhcHRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoIWlzU2NyaXB0QWxyZWFkeUluY2x1ZGVkKHVybCkpIHtcbiAgICAgICAgbG9hZGVkVXBseW5rQWRhcHRpdmUgPSBmYWxzZTtcbiAgICAgICAgbG9hZFNjcmlwdEFzeW5jKHVybCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbG9hZGVkVXBseW5rQWRhcHRpdmUgPSB0cnVlO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IEFkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAobG9hZGVkVXBseW5rQWRhcHRpdmUpIHtcbiAgICAgICAgY2FsbGJhY2sobmV3IEFkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy9zY3JpcHQgaXMgbG9hZGluZyBzbyB3ZSdsbCBrZWVwIGNoZWNraW5nIGl0J3NcbiAgICAgICAgLy8gc3RhdHVzIGJlZm9yZSBmaXJpbmcgdGhlIGNhbGxiYWNrXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zLCBjYWxsYmFjayk7XG4gICAgICAgIH0sIDUwMCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBsb2FkU2NyaXB0QXN5bmModXJsOiBzdHJpbmcsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgbGV0IGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdO1xuICAgIGxldCBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcblxuICAgIHNjcmlwdC50eXBlID0gJ3RleHQvamF2YXNjcmlwdCc7XG4gICAgc2NyaXB0LnNyYyA9IHVybDtcblxuICAgIHNjcmlwdC5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbGxiYWNrKCk7XG4gICAgfTtcblxuICAgIGhlYWQuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcbn1cblxuZnVuY3Rpb24gaXNTY3JpcHRBbHJlYWR5SW5jbHVkZWQodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICB2YXIgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwic2NyaXB0XCIpO1xuICAgIGlmIChzY3JpcHRzICYmIHNjcmlwdHMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjcmlwdHNbaV0uc3JjID09PSB1cmwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQWRhcHRpdmVQbGF5ZXIodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM6IGFueSwgY2FsbGJhY2s/OiAocGxheWVyOiBQbGF5ZXIpID0+IHZvaWQpIHtcblxuICAgIGlmIChvcHRpb25zLnByZWZlck5hdGl2ZVBsYXliYWNrKSB7XG4gICAgICAgIGlmIChpc05hdGl2ZVBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJ1c2luZyBuYXRpdmUgcGxheWJhY2tcIik7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgTmF0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoaXNIdG1sUGxheWJhY2tTdXBwb3J0ZWQoKSkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhcImZhbGxpbmcgYmFjayB0byB1cGx5bmsgcGxheWVyXCIpO1xuICAgICAgICAgICAgbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zLCBjYWxsYmFjayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoaXNIdG1sUGxheWJhY2tTdXBwb3J0ZWQoKSkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhcInVzaW5nIHVwbHluayBwbGF5ZXJcIik7XG4gICAgICAgICAgICBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChpc05hdGl2ZVBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJmYWxsaW5nIGJhY2sgdG8gbmF0aXZlIHBsYXliYWNrXCIpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IE5hdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnNvbGUud2FybihcIm5vIHBsYXliYWNrIG1vZGUgc3VwcG9ydGVkXCIpO1xuICAgIGNhbGxiYWNrKHVuZGVmaW5lZCk7XG59XG5cbig8YW55PndpbmRvdykuY3JlYXRlQWRhcHRpdmVQbGF5ZXIgPSBjcmVhdGVBZGFwdGl2ZVBsYXllcjtcbig8YW55PndpbmRvdykuQWRhcHRpdmVQbGF5ZXIgPSBBZGFwdGl2ZVBsYXllcjtcbiIsImltcG9ydCB7IFN0cmluZ01hcCB9IGZyb20gJy4vc3RyaW5nLW1hcCc7XG5cbi8vaHR0cDovL3d3dy5kYXRjaGxleS5uYW1lL2VzNi1ldmVudGVtaXR0ZXIvXG4vL2h0dHBzOi8vZ2lzdC5naXRodWIuY29tL2RhdGNobGV5LzM3MzUzZDZhMmNiNjI5Njg3ZWI5XG4vL2h0dHA6Ly9jb2RlcGVuLmlvL3l1a3VsZWxlL3Blbi95TlZWeFYvP2VkaXRvcnM9MDAxXG5leHBvcnQgY2xhc3MgT2JzZXJ2YWJsZSB7XG4gICAgcHJpdmF0ZSBfbGlzdGVuZXJzOiBTdHJpbmdNYXA8YW55PjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMgPSBuZXcgU3RyaW5nTWFwKCk7XG4gICAgfVxuXG4gICAgb24obGFiZWw6IHN0cmluZywgY2FsbGJhY2s6IGFueSkge1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMuaGFzKGxhYmVsKSB8fCB0aGlzLl9saXN0ZW5lcnMuc2V0KGxhYmVsLCBbXSk7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycy5nZXQobGFiZWwpLnB1c2goY2FsbGJhY2spO1xuICAgIH1cblxuICAgIG9mZihsYWJlbDogc3RyaW5nLCBjYWxsYmFjazogYW55KSB7XG4gICAgICAgIGxldCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGxhYmVsKTtcbiAgICAgICAgbGV0IGluZGV4OiBudW1iZXI7XG5cbiAgICAgICAgaWYgKGxpc3RlbmVycyAmJiBsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBpbmRleCA9IGxpc3RlbmVycy5yZWR1Y2UoKGk6IG51bWJlciwgbGlzdGVuZXI6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAodGhpcy5faXNGdW5jdGlvbihsaXN0ZW5lcikgJiYgbGlzdGVuZXIgPT09IGNhbGxiYWNrKSA/IGkgPSBpbmRleCA6IGk7XG4gICAgICAgICAgICB9LCAtMSk7XG5cbiAgICAgICAgICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fbGlzdGVuZXJzLnNldChsYWJlbCwgbGlzdGVuZXJzKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZmlyZShsYWJlbDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBsZXQgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChsYWJlbCk7XG5cbiAgICAgICAgaWYgKGxpc3RlbmVycyAmJiBsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaCgobGlzdGVuZXI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKC4uLmFyZ3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNGdW5jdGlvbihvYmo6IGFueSkge1xuICAgICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PSAnZnVuY3Rpb24nIHx8IGZhbHNlO1xuICAgIH1cbn0iLCJpbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi4vYWQvYWQtYnJlYWsnO1xuXG5leHBvcnQgY2xhc3MgU2VnbWVudE1hcCB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfc2VnbWVudHM6IFNlZ21lbnRbXTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9hZEJyZWFrczogQWRCcmVha1tdO1xuXG4gICAgY29uc3RydWN0b3Ioc2VnbWVudHM6IFNlZ21lbnRbXSkge1xuICAgICAgICB0aGlzLl9zZWdtZW50cyA9IHNlZ21lbnRzO1xuICAgICAgICB0aGlzLl9hZEJyZWFrcyA9IFtdO1xuICAgICAgICB0aGlzLl9pbml0QWRicmVha3MoKTtcbiAgICB9XG5cbiAgICBmaW5kU2VnbWVudCh0aW1lOiBudW1iZXIpOiBTZWdtZW50IHwgdW5kZWZpbmVkIHtcbiAgICAgICAgbGV0IGluZGV4ID0gdGhpcy5nZXRTZWdtZW50SW5kZXhBdCh0aW1lKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2VnbWVudEF0KGluZGV4KTtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50QXQoaW5kZXg6IG51bWJlcik6IFNlZ21lbnQge1xuICAgICAgICBpZiAoaW5kZXggPj0gMCAmJiBpbmRleCA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRzW2luZGV4XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZ2V0U2VnbWVudEluZGV4QXQodGltZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zZWdtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IHNlZ21lbnQgPSB0aGlzLl9zZWdtZW50c1tpXTtcbiAgICAgICAgICAgIGlmIChzZWdtZW50LnN0YXJ0VGltZSA8PSB0aW1lICYmIHRpbWUgPD0gc2VnbWVudC5lbmRUaW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHMubGVuZ3RoO1xuICAgIH1cblxuICAgIGdldCBhZEJyZWFrcygpOiBBZEJyZWFrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRCcmVha3M7XG4gICAgfVxuXG4gICAgZ2V0IGNvbnRlbnRTZWdtZW50cygpOiBTZWdtZW50W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHMuZmlsdGVyKFNlZ21lbnRNYXAuaXNDb250ZW50KTtcbiAgICB9XG5cbiAgICBzdGF0aWMgaXNBZChzZWdtZW50OiBTZWdtZW50KTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBzZWdtZW50LnR5cGUgPT09IFwiQURcIjtcbiAgICB9XG5cbiAgICBzdGF0aWMgaXNDb250ZW50KHNlZ21lbnQ6IFNlZ21lbnQpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHNlZ21lbnQudHlwZSA9PT0gXCJDT05URU5UXCI7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaW5pdEFkYnJlYWtzKCk6IHZvaWQge1xuICAgICAgICBsZXQgYWRzOiBTZWdtZW50W10gPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB3aGlsZSAoaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aCAmJiBTZWdtZW50TWFwLmlzQWQodGhpcy5fc2VnbWVudHNbaV0pKSB7XG4gICAgICAgICAgICAgICAgYWRzLnB1c2godGhpcy5fc2VnbWVudHNbaV0pO1xuICAgICAgICAgICAgICAgIGkrK1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZEJyZWFrcy5wdXNoKG5ldyBBZEJyZWFrKGFkcykpO1xuICAgICAgICAgICAgICAgIGFkcyA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5BZEJyZWFrKHRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2FkQnJlYWtzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgYWRCcmVhayA9IHRoaXMuX2FkQnJlYWtzW2ldO1xuICAgICAgICAgICAgaWYgKGFkQnJlYWsuY29udGFpbnModGltZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXRBZEJyZWFrKHRpbWU6IG51bWJlcik6IEFkQnJlYWsge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRCcmVha3MuZmluZCgoYWRCcmVhazogQWRCcmVhayk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGFkQnJlYWsuY29udGFpbnModGltZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEFkQnJlYWtzQmV0d2VlbihzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcik6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcy5maWx0ZXIoKGFkQnJlYWs6IEFkQnJlYWspOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydCA8PSBhZEJyZWFrLnN0YXJ0VGltZSAmJiBhZEJyZWFrLmVuZFRpbWUgPD0gZW5kO1xuICAgICAgICB9KTtcbiAgICB9XG59IiwiZXhwb3J0IGNsYXNzIFN0cmluZ01hcDxWPiB7XG4gICAgcHJpdmF0ZSBfbWFwOiBhbnk7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fbWFwID0gbmV3IE9iamVjdCgpO1xuICAgIH1cblxuICAgIGdldCBzaXplKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9tYXApLmxlbmd0aDtcbiAgICB9XG5cbiAgICBoYXMoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcC5oYXNPd25Qcm9wZXJ0eShrZXkpO1xuICAgIH1cblxuICAgIGdldChrZXk6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFwW2tleV07XG4gICAgfVxuXG4gICAgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogVikge1xuICAgICAgICB0aGlzLl9tYXBba2V5XSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGNsZWFyKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fbWFwKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBrZXlzW2ldO1xuICAgICAgICAgICAgdGhpcy5fbWFwW2tleV0gPSBudWxsO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX21hcFtrZXldO1xuICAgICAgICB9XG4gICAgfVxufSIsImltcG9ydCB7IHRvSGV4U3RyaW5nIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBUaHVtYiwgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi4vd2ViLXNlcnZpY2VzL2Fzc2V0LWluZm8tc2VydmljZSc7XG5pbXBvcnQgeyBTZWdtZW50TWFwIH0gZnJvbSAnLi9zZWdtZW50LW1hcCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGh1bWJuYWlsIHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2VnbWVudHM6IFNlZ21lbnRNYXAsIGFzc2V0SW5mb1NlcnZpY2U6IEFzc2V0SW5mb1NlcnZpY2UsIHRodW1ibmFpbFNpemU6IFwic21hbGxcIiB8IFwibGFyZ2VcIiA9IFwic21hbGxcIik6IFRodW1ibmFpbCB7XG4gICAgaWYgKGlzTmFOKHRpbWUpIHx8IHRpbWUgPCAwKSB7XG4gICAgICAgIHRpbWUgPSAwO1xuICAgIH1cblxuICAgIGNvbnN0IHNlZ21lbnQgPSBzZWdtZW50cy5maW5kU2VnbWVudCh0aW1lKTtcbiAgICBpZiAoc2VnbWVudCkge1xuICAgICAgICBjb25zdCBhc3NldCA9IGFzc2V0SW5mb1NlcnZpY2UuZ2V0QXNzZXRJbmZvKHNlZ21lbnQuaWQpO1xuICAgICAgICBpZiAoYXNzZXQgJiYgYXNzZXQudGh1bWJzKSB7XG4gICAgICAgICAgICBjb25zdCBzbGljZU51bWJlciA9IGdldFNsaWNlTnVtYmVyKHRpbWUsIHNlZ21lbnQsIGFzc2V0KTtcbiAgICAgICAgICAgIGNvbnN0IHRodW1iID0gZ2V0VGh1bWIoYXNzZXQsIHRodW1ibmFpbFNpemUpO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHVybDogZ2V0VGh1bWJuYWlsVXJsKGFzc2V0LCBzbGljZU51bWJlciwgdGh1bWIpLFxuICAgICAgICAgICAgICAgIGhlaWdodDogdGh1bWIuaGVpZ2h0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB0aHVtYi53aWR0aFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdXJsOiAnJyxcbiAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICB3aWR0aDogMFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGdldFRodW1ibmFpbFVybChhc3NldDogQXNzZXRJbmZvLCBzbGljZU51bWJlcjogbnVtYmVyLCB0aHVtYjogVGh1bWIpOiBzdHJpbmcge1xuICAgIGxldCBwcmVmaXggPSBhc3NldC50aHVtYlByZWZpeDtcblxuICAgIGlmIChhc3NldC5zdG9yYWdlUGFydGl0aW9ucyAmJiBhc3NldC5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhc3NldC5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcGFydGl0aW9uID0gYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnNbaV07XG4gICAgICAgICAgICBpZiAocGFydGl0aW9uLnN0YXJ0IDw9IHNsaWNlTnVtYmVyICYmIHNsaWNlTnVtYmVyIDwgcGFydGl0aW9uLmVuZCkge1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHBhcnRpdGlvbi51cmw7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocHJlZml4W3ByZWZpeC5sZW5ndGggLSAxXSAhPT0gJy8nKSB7XG4gICAgICAgIHByZWZpeCArPSAnLyc7XG4gICAgfVxuXG4gICAgY29uc3Qgc2xpY2VIZXhOdW1iZXIgPSB0b0hleFN0cmluZyhzbGljZU51bWJlcik7XG5cbiAgICByZXR1cm4gYCR7cHJlZml4fSR7dGh1bWIucHJlZml4fSR7c2xpY2VIZXhOdW1iZXJ9LmpwZ2A7XG59XG5cbmZ1bmN0aW9uIGdldFRodW1iKGFzc2V0OiBBc3NldEluZm8sIHNpemU6ICdzbWFsbCcgfCAnbGFyZ2UnKTogVGh1bWIge1xuICAgIC8vZGVmYXVsdCB0byBzbWFsbGVzdCB0aHVtYlxuICAgIGxldCB0aHVtYjogVGh1bWIgPSBhc3NldC50aHVtYnNbMF07XG5cbiAgICBpZiAoc2l6ZSA9PT0gXCJsYXJnZVwiKSB7XG4gICAgICAgIC8vbGFzdCB0aHVtYiBpcyB0aGUgbGFyZ2VzdFxuICAgICAgICB0aHVtYiA9IGFzc2V0LnRodW1ic1thc3NldC50aHVtYnMubGVuZ3RoIC0gMV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRodW1iO1xufVxuXG5cbmZ1bmN0aW9uIGdldFNsaWNlTnVtYmVyKHRpbWU6IG51bWJlciwgc2VnbWVudDogU2VnbWVudCwgYXNzZXQ6IEFzc2V0SW5mbyk6IG51bWJlciB7XG4gICAgbGV0IHNsaWNlTnVtYmVyID0gTWF0aC5jZWlsKCh0aW1lIC0gc2VnbWVudC5zdGFydFRpbWUpIC8gYXNzZXQuc2xpY2VEdXJhdGlvbik7XG4gICAgc2xpY2VOdW1iZXIgKz0gc2VnbWVudC5pbmRleDtcblxuICAgIGlmIChzbGljZU51bWJlciA+IGFzc2V0Lm1heFNsaWNlKSB7XG4gICAgICAgIHNsaWNlTnVtYmVyID0gYXNzZXQubWF4U2xpY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNsaWNlTnVtYmVyO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHRvVGltZVN0cmluZyh0aW1lOiBudW1iZXIpIHtcbiAgICBpZiAoaXNOYU4odGltZSkpIHtcbiAgICAgICAgdGltZSA9IDA7XG4gICAgfVxuXG4gICAgbGV0IG5lZ2F0aXZlID0gKHRpbWUgPCAwKSA/IFwiLVwiIDogXCJcIjtcblxuICAgIHRpbWUgPSBNYXRoLmFicyh0aW1lKTtcblxuICAgIGxldCBzZWNvbmRzID0gKHRpbWUgJSA2MCkgfCAwO1xuICAgIGxldCBtaW51dGVzID0gKCh0aW1lIC8gNjApICUgNjApIHwgMDtcbiAgICBsZXQgaG91cnMgPSAoKCh0aW1lIC8gNjApIC8gNjApICUgNjApIHwgMDtcbiAgICBsZXQgc2hvd0hvdXJzID0gaG91cnMgPiAwO1xuXG4gICAgbGV0IGhyU3RyID0gaG91cnMgPCAxMCA/IGAwJHtob3Vyc31gIDogYCR7aG91cnN9YDtcbiAgICBsZXQgbWluU3RyID0gbWludXRlcyA8IDEwID8gYDAke21pbnV0ZXN9YCA6IGAke21pbnV0ZXN9YDtcbiAgICBsZXQgc2VjU3RyID0gc2Vjb25kcyA8IDEwID8gYDAke3NlY29uZHN9YCA6IGAke3NlY29uZHN9YDtcblxuICAgIGlmIChzaG93SG91cnMpIHtcbiAgICAgICAgcmV0dXJuIGAke25lZ2F0aXZlfSR7aHJTdHJ9OiR7bWluU3RyfToke3NlY1N0cn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBgJHtuZWdhdGl2ZX0ke21pblN0cn06JHtzZWNTdHJ9YDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0hleFN0cmluZyhudW1iZXI6IG51bWJlciwgbWluTGVuZ3RoID0gOCk6IHN0cmluZyB7XG4gICAgbGV0IGhleCA9IG51bWJlci50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTtcbiAgICB3aGlsZSAoaGV4Lmxlbmd0aCA8IG1pbkxlbmd0aCkge1xuICAgICAgICBoZXggPSBcIjBcIiArIGhleDtcbiAgICB9XG5cbiAgICByZXR1cm4gaGV4O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmFzZTY0VG9CdWZmZXIoYjY0ZW5jb2RlZDogc3RyaW5nKTogVWludDhBcnJheSB7XG4gICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGF0b2IoYjY0ZW5jb2RlZCkuc3BsaXQoXCJcIikubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiBjLmNoYXJDb2RlQXQoMCk7IH0pKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2xpY2UoZGF0YTogVWludDhBcnJheSwgc3RhcnQ6IG51bWJlciwgZW5kPzogbnVtYmVyKTogVWludDhBcnJheSB7XG4gICAgLy9JRSAxMSBkb2Vzbid0IHN1cHBvcnQgc2xpY2UoKSBvbiBUeXBlZEFycmF5IG9iamVjdHNcbiAgICBpZiAoZGF0YS5zbGljZSkge1xuICAgICAgICByZXR1cm4gZGF0YS5zbGljZShzdGFydCwgZW5kKTtcbiAgICB9XG5cbiAgICBpZiAoZW5kKSB7XG4gICAgICAgIHJldHVybiBkYXRhLnN1YmFycmF5KHN0YXJ0LCBlbmQpO1xuICAgIH1cblxuICAgIHJldHVybiBkYXRhLnN1YmFycmF5KHN0YXJ0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlKClcbntcbiAgICAvLyBDb3BpZWQgZnJvbSBQbHlyIGNvZGVcbiAgICBpZiAoISgnbG9jYWxTdG9yYWdlJyBpbiB3aW5kb3cpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBUcnkgdG8gdXNlIGl0IChpdCBtaWdodCBiZSBkaXNhYmxlZCwgZS5nLiB1c2VyIGlzIGluIHByaXZhdGUgbW9kZSlcbiAgICAvLyBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9TZWx6L3BseXIvaXNzdWVzLzEzMVxuICAgIHRyeSB7XG4gICAgICAgIC8vIEFkZCB0ZXN0IGl0ZW1cbiAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdfX190ZXN0JywgJ09LJyk7XG5cbiAgICAgICAgLy8gR2V0IHRoZSB0ZXN0IGl0ZW1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnX19fdGVzdCcpO1xuXG4gICAgICAgIC8vIENsZWFuIHVwXG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnX19fdGVzdCcpO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHZhbHVlIG1hdGNoZXNcbiAgICAgICAgcmV0dXJuIChyZXN1bHQgPT09ICdPSycpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4uL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCB7IFN0cmluZ01hcCB9IGZyb20gJy4uL3V0aWxzL3N0cmluZy1tYXAnO1xuXG5jb25zdCBlbnVtIFR2UmF0aW5nIHtcbiAgICBOb3RBdmFpbGFibGUgPSAtMSxcbiAgICBOb3RBcHBsaWNhYmxlID0gMCxcbiAgICBUVl9ZID0gMSxcbiAgICBUVl9ZNyA9IDIsXG4gICAgVFZfRyA9IDMsXG4gICAgVFZfUEcgPSA0LFxuICAgIFRWXzE0ID0gNSxcbiAgICBUVl9NQSA9IDYsXG4gICAgTm90UmF0ZWQgPSA3XG59XG5cbmNvbnN0IGVudW0gTW92aWVSYXRpbmcge1xuICAgIE5vdEF2YWlsYWJsZSA9IC0xLFxuICAgIE5vdEFwcGxpY2FibGUgPSAwLFxuICAgIEcgPSAxLFxuICAgIFBHID0gMixcbiAgICBQR18xMyA9IDMsXG4gICAgUiA9IDQsXG4gICAgTkNfMTcgPSA1LFxuICAgIFggPSA2LFxuICAgIE5vdFJhdGVkID0gN1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRodW1iIHtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIHByZWZpeDogc3RyaW5nO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3JhZ2VQYXJpdGlvbiB7XG4gICAgLyoqXG4gICAgICogU3RhcnRpbmcgc2xpY2UgbnVtYmVyLCBpbmNsdXNpdmVcbiAgICAgKi9cbiAgICBzdGFydDogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogRW5kaW5nIHNsaWNlIG51bWJlciwgZXhjbHVzaXZlXG4gICAgICovXG4gICAgZW5kOiBudW1iZXI7XG4gICAgdXJsOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBBc3NldEluZm9TZXJpYWxpemVkIHtcbiAgICBhdWRpb19vbmx5OiBudW1iZXI7XG4gICAgZXJyb3I6IG51bWJlcjtcbiAgICB0dl9yYXRpbmc6IG51bWJlcjtcbiAgICBzdG9yYWdlX3BhcnRpdGlvbnM6IFN0b3JhZ2VQYXJpdGlvbltdO1xuICAgIG1heF9zbGljZTogbnVtYmVyO1xuICAgIHRodW1iX3ByZWZpeDogc3RyaW5nO1xuICAgIGFkX2RhdGE6IE9iamVjdDtcbiAgICBzbGljZV9kdXI6IG51bWJlcjtcbiAgICBtb3ZpZV9yYXRpbmc6IG51bWJlcjtcbiAgICBvd25lcjogc3RyaW5nO1xuICAgIHJhdGVzOiBudW1iZXJbXTtcbiAgICB0aHVtYnM6IFRodW1iW107XG4gICAgcG9zdGVyX3VybDogc3RyaW5nO1xuICAgIGR1cmF0aW9uOiBudW1iZXI7XG4gICAgZGVmYXVsdF9wb3N0ZXJfdXJsOiBzdHJpbmc7XG4gICAgZGVzYzogc3RyaW5nO1xuICAgIHJhdGluZ19mbGFnczogbnVtYmVyO1xuICAgIGV4dGVybmFsX2lkOiBzdHJpbmc7XG4gICAgaXNfYWQ6IG51bWJlcjtcbiAgICBhc3NldDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQWREYXRhIHtcbiAgICBjbGljaz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRJbmZvIHtcbiAgICByZWFkb25seSBhdWRpb09ubHk6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgZXJyb3I6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgdHZSYXRpbmc6IFR2UmF0aW5nO1xuICAgIHJlYWRvbmx5IHN0b3JhZ2VQYXJ0aXRpb25zOiBTdG9yYWdlUGFyaXRpb25bXTtcbiAgICByZWFkb25seSBtYXhTbGljZTogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHRodW1iUHJlZml4OiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgYWREYXRhOiBBZERhdGE7XG4gICAgcmVhZG9ubHkgc2xpY2VEdXJhdGlvbjogbnVtYmVyO1xuICAgIHJlYWRvbmx5IG1vdmllUmF0aW5nOiBNb3ZpZVJhdGluZztcbiAgICByZWFkb25seSBvd25lcjogc3RyaW5nO1xuICAgIHJlYWRvbmx5IHJhdGVzOiBudW1iZXJbXTtcbiAgICByZWFkb25seSB0aHVtYnM6IFRodW1iW107XG4gICAgcmVhZG9ubHkgcG9zdGVyVXJsOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBkZWZhdWx0UG9zdGVyVXJsOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICByZWFkb25seSByYXRpbmdGbGFnczogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGV4dGVybmFsSWQ6IHN0cmluZztcbiAgICByZWFkb25seSBpc0FkOiBib29sZWFuO1xuICAgIHJlYWRvbmx5IGFzc2V0OiBzdHJpbmc7XG5cbiAgICBjb25zdHJ1Y3RvcihvYmo6IEFzc2V0SW5mb1NlcmlhbGl6ZWQsIGlzQWQ6IGJvb2xlYW4gfCBudWxsKSB7XG4gICAgICAgIHRoaXMuYXVkaW9Pbmx5ID0gb2JqLmF1ZGlvX29ubHkgPT0gMTtcbiAgICAgICAgdGhpcy5lcnJvciA9IG9iai5lcnJvciA9PSAxO1xuICAgICAgICB0aGlzLnR2UmF0aW5nID0gb2JqLnR2X3JhdGluZztcbiAgICAgICAgdGhpcy5zdG9yYWdlUGFydGl0aW9ucyA9IG9iai5zdG9yYWdlX3BhcnRpdGlvbnM7XG4gICAgICAgIHRoaXMubWF4U2xpY2UgPSBvYmoubWF4X3NsaWNlO1xuICAgICAgICB0aGlzLnRodW1iUHJlZml4ID0gb2JqLnRodW1iX3ByZWZpeDtcbiAgICAgICAgdGhpcy5hZERhdGEgPSBvYmouYWRfZGF0YTtcbiAgICAgICAgdGhpcy5zbGljZUR1cmF0aW9uID0gb2JqLnNsaWNlX2R1cjtcbiAgICAgICAgdGhpcy5tb3ZpZVJhdGluZyA9IG9iai5tb3ZpZV9yYXRpbmc7XG4gICAgICAgIHRoaXMub3duZXIgPSBvYmoub3duZXI7XG4gICAgICAgIHRoaXMucmF0ZXMgPSBvYmoucmF0ZXM7XG4gICAgICAgIHRoaXMudGh1bWJzID0gb2JqLnRodW1icztcbiAgICAgICAgdGhpcy5wb3N0ZXJVcmwgPSBvYmoucG9zdGVyX3VybDtcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IG9iai5kdXJhdGlvbjtcbiAgICAgICAgdGhpcy5kZWZhdWx0UG9zdGVyVXJsID0gb2JqLmRlZmF1bHRfcG9zdGVyX3VybDtcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IG9iai5kZXNjO1xuICAgICAgICB0aGlzLnJhdGluZ0ZsYWdzID0gb2JqLnJhdGluZ19mbGFncztcbiAgICAgICAgdGhpcy5leHRlcm5hbElkID0gb2JqLmV4dGVybmFsX2lkO1xuICAgICAgICB0aGlzLmFzc2V0ID0gb2JqLmFzc2V0O1xuXG4gICAgICAgIC8vdXNlIHZhbHVlIGZyb20gU2VnbWVudE1hcCBpZiBhdmFpbGFibGUgKCMxMTgsIFVQLTQzNTQpXG4gICAgICAgIGlmIChpc0FkID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBZCA9IG9iai5pc19hZCA9PT0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaXNBZCA9IGlzQWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvL3NvcnQgdGh1bWJzIGJ5IGltYWdlIHdpZHRoLCBzbWFsbGVzdCB0byBsYXJnZXN0XG4gICAgICAgIC8vIHRodW1icyBtYXkgYmUgdW5kZWZpbmVkIHdoZW4gcGxheWluZyBhbiBhdWRpby1vbmx5IGFzc2V0XG4gICAgICAgIGlmICh0aGlzLnRodW1icykge1xuICAgICAgICAgICAgdGhpcy50aHVtYnMuc29ydChmdW5jdGlvbiAobGVmdDogVGh1bWIsIHJpZ2h0OiBUaHVtYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBsZWZ0LndpZHRoIC0gcmlnaHQud2lkdGg7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vY2xhbXAgc3RvcmFnZSBwYXJ0aXRpb24gc2xpY2UgZW5kIG51bWJlcnMgYXMgdGhleSBjYW4gYmUgbGFyZ2VyIHRoYW5cbiAgICAgICAgLy8gamF2YXNjcmlwdCBjYW4gc2FmZWx5IHJlcHJlc2VudFxuICAgICAgICBpZiAodGhpcy5zdG9yYWdlUGFydGl0aW9ucyAmJiB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgLy9OdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA9PT0gOTAwNzE5OTI1NDc0MDk5MVxuICAgICAgICAgICAgICAgIC8vTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgbm90IHN1cHBvcnRlZCBpbiBJRVxuICAgICAgICAgICAgICAgIHRoaXMuc3RvcmFnZVBhcnRpdGlvbnNbaV0uZW5kID0gTWF0aC5taW4odGhpcy5zdG9yYWdlUGFydGl0aW9uc1tpXS5lbmQsIDkwMDcxOTkyNTQ3NDA5OTEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRJbmZvU2VydmljZSB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfZG9tYWluOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfY2FjaGU6IFN0cmluZ01hcDxBc3NldEluZm8+O1xuXG4gICAgY29uc3RydWN0b3IoZG9tYWluOiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgICAgICB0aGlzLl9kb21haW4gPSBkb21haW47XG4gICAgICAgIHRoaXMuX3Nlc3Npb25JZCA9IHNlc3Npb25JZDtcbiAgICAgICAgdGhpcy5fY2FjaGUgPSBuZXcgU3RyaW5nTWFwPEFzc2V0SW5mbz4oKTtcblxuICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMgPSB0aGlzLl9sb2FkU2VnbWVudHMuYmluZCh0aGlzKTtcbiAgICB9XG5cbiAgICBsb2FkU2VnbWVudE1hcChzZWdtZW50TWFwOiBTZWdtZW50TWFwLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICBsZXQgc2VnbWVudHM6IFNlZ21lbnRbXSA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2VnbWVudE1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IHNlZ21lbnQgPSBzZWdtZW50TWFwLmdldFNlZ21lbnRBdChpKTtcbiAgICAgICAgICAgIHNlZ21lbnRzLnB1c2goc2VnbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMoc2VnbWVudHMsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9sb2FkU2VnbWVudHMoc2VnbWVudHM6IFNlZ21lbnRbXSwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHNlZ21lbnRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlZ21lbnQgPSBzZWdtZW50cy5zaGlmdCgpO1xuICAgICAgICB0aGlzLmxvYWRTZWdtZW50KHNlZ21lbnQsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2xvYWRTZWdtZW50cyhzZWdtZW50cywgY2FsbGJhY2spO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvL2xvYWQoYXNzZXRJZDogc3RyaW5nLCBjYWxsQmFjazogKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgbG9hZEFzc2V0SWQoYXNzZXRJZDogc3RyaW5nLCBpc0FkOiBib29sZWFuIHwgbnVsbCwgY2FsbEJhY2s6IChhc3NldEluZm86IEFzc2V0SW5mbykgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5pc0xvYWRlZChhc3NldElkKSkge1xuICAgICAgICAgICAgLy9hc3NldEluZm8gZm9yIGFzc2V0SWQgaXMgYWxyZWFkeSBsb2FkZWRcbiAgICAgICAgICAgIGxldCBpbmZvID0gdGhpcy5fY2FjaGUuZ2V0KGFzc2V0SWQpO1xuICAgICAgICAgICAgY2FsbEJhY2soaW5mbyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdXJsID0gYC8vJHt0aGlzLl9kb21haW59L3BsYXllci9hc3NldGluZm8vJHthc3NldElkfS5qc29uYDtcblxuICAgICAgICBpZiAodGhpcy5fc2Vzc2lvbklkICYmIHRoaXMuX3Nlc3Npb25JZCAhPSBcIlwiKSB7XG4gICAgICAgICAgICB1cmwgPSBgJHt1cmx9P3Bicz0ke3RoaXMuX3Nlc3Npb25JZH1gO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub25sb2FkZW5kID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgbGV0IG9iaiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgICAgICAgICAgICAgbGV0IGFzc2V0SW5mbyA9IG5ldyBBc3NldEluZm8ob2JqLCBpc0FkKTtcblxuICAgICAgICAgICAgICAgIC8vYWRkIGFzc2V0SW5mbyB0byBjYWNoZVxuICAgICAgICAgICAgICAgIHRoaXMuX2NhY2hlLnNldChhc3NldElkLCBhc3NldEluZm8pO1xuXG4gICAgICAgICAgICAgICAgY2FsbEJhY2soYXNzZXRJbmZvKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbEJhY2sobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsKTtcbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG5cbiAgICBsb2FkU2VnbWVudChzZWdtZW50OiBTZWdtZW50LCBjYWxsQmFjazogKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGFzc2V0SWQ6IHN0cmluZyA9IHNlZ21lbnQuaWQ7XG4gICAgICAgIGNvbnN0IGlzQWQgPSBTZWdtZW50TWFwLmlzQWQoc2VnbWVudCk7XG5cbiAgICAgICAgdGhpcy5sb2FkQXNzZXRJZChhc3NldElkLCBpc0FkLCBjYWxsQmFjayk7XG4gICAgfVxuXG4gICAgaXNMb2FkZWQoYXNzZXRJZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWNoZS5oYXMoYXNzZXRJZCk7XG4gICAgfVxuXG4gICAgZ2V0QXNzZXRJbmZvKGFzc2V0SWQ6IHN0cmluZyk6IEFzc2V0SW5mbyB7XG4gICAgICAgIGlmICh0aGlzLmlzTG9hZGVkKGFzc2V0SWQpKSB7XG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIHJldHVybiBpbmZvO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjbGVhcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICB9XG59XG4iLCJleHBvcnQgY2xhc3MgUGluZ1NlcnZpY2Uge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBfcGluZ1NlcnZlcjogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9zZW50U3RhcnRQaW5nOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3NlZWtpbmc6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIF9jdXJyZW50VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX3NlZWtGcm9tVGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX25leHRUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IFNUQVJUID0gXCJzdGFydFwiO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgU0VFSyA9IFwic2Vla1wiO1xuXG4gICAgY29uc3RydWN0b3IoZG9tYWluOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nLCB2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuXG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IGRvbWFpbjtcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuXG4gICAgICAgIHRoaXMuX3BpbmdTZXJ2ZXIgPSBzZXNzaW9uSWQgIT0gbnVsbCAmJiBzZXNzaW9uSWQgIT0gXCJcIjtcbiAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgdGhpcy5fc2VudFN0YXJ0UGluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9zZWVraW5nID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSAwLjA7XG4gICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IDAuMDtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuXG4gICAgICAgIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkID0gdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TdGFydCA9IHRoaXMuX29uU3RhcnQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TZWVrZWQgPSB0aGlzLl9vblNlZWtlZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblNlZWtpbmcgPSB0aGlzLl9vblNlZWtpbmcuYmluZCh0aGlzKTtcblxuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlcikge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0aGlzLl9vblN0YXJ0KTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uU2Vla2VkKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblNlZWtpbmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfY3JlYXRlUXVlcnlTdHJpbmcoZXZlbnQ6IHN0cmluZywgY3VycmVudFBvc2l0aW9uOiBudW1iZXIsIGZyb21Qb3NpdGlvbj86IG51bWJlcikge1xuICAgICAgICBjb25zdCBWRVJTSU9OID0gMztcblxuICAgICAgICBpZiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGxldCBzdHIgPSBgdj0ke1ZFUlNJT059JmV2PSR7ZXZlbnR9JnB0PSR7Y3VycmVudFBvc2l0aW9ufWA7XG5cbiAgICAgICAgICAgIGlmIChmcm9tUG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICBzdHIgKz0gYCZmdD0ke2Zyb21Qb3NpdGlvbn1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGB2PSR7VkVSU0lPTn0mcHQ9JHtjdXJyZW50UG9zaXRpb259YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblN0YXJ0KCkge1xuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiAhdGhpcy5fc2VudFN0YXJ0UGluZykge1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcodGhpcy5TVEFSVCwgMCk7XG4gICAgICAgICAgICB0aGlzLl9zZW50U3RhcnRQaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2Vla2luZygpIHtcbiAgICAgICAgdGhpcy5fc2Vla2luZyA9IHRydWU7XG4gICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSB0aGlzLl9jdXJyZW50VGltZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNlZWtlZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BpbmdTZXJ2ZXIgJiYgdGhpcy5fc2Vla2luZyAmJiB0aGlzLl9zZWVrRnJvbVRpbWUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKHRoaXMuU0VFSywgdGhpcy5fY3VycmVudFRpbWUsIHRoaXMuX3NlZWtGcm9tVGltZSk7XG4gICAgICAgICAgICB0aGlzLl9zZWVraW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCgpIHtcbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSB0aGlzLl92aWRlby5jdXJyZW50VGltZTtcblxuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiAhdGhpcy5fc2Vla2luZyAmJiB0aGlzLl9uZXh0VGltZSAmJiB0aGlzLl9jdXJyZW50VGltZSA+IHRoaXMuX25leHRUaW1lKSB7XG4gICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKG51bGwsIHRoaXMuX2N1cnJlbnRUaW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3NlbmRQaW5nKGV2ZW50OiBzdHJpbmcsIGN1cnJlbnRQb3NpdGlvbjogbnVtYmVyLCBmcm9tUG9zaXRpb24/OiBudW1iZXIpIHtcbiAgICAgICAgbGV0IHVybCA9IGAvLyR7dGhpcy5fZG9tYWlufS9zZXNzaW9uL3BpbmcvJHt0aGlzLl9zZXNzaW9uSWR9Lmpzb24/JHt0aGlzLl9jcmVhdGVRdWVyeVN0cmluZyhldmVudCwgY3VycmVudFBvc2l0aW9uLCBmcm9tUG9zaXRpb24pfWA7XG5cbiAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub3BlbihcIkdFVFwiLCB1cmwsIHRydWUpO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gXCJ0ZXh0XCI7XG5cbiAgICAgICAgeGhyLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09IDIwMCkge1xuICAgICAgICAgICAgICAgIGxldCBqc29uID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IGpzb24ubmV4dF90aW1lO1xuXG4gICAgICAgICAgICAgICAgLy9hYnNlbmNlIG9mIGVycm9yIHByb3BlcnR5IGluZGljYXRlcyBubyBlcnJvclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9uZXh0VGltZSA8IDAgfHwganNvbi5oYXNPd25Qcm9wZXJ0eSgnZXJyb3InKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9waW5nU2VydmVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0aGlzLl9vblN0YXJ0KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25TZWVrZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25TZWVraW5nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG59Il19
