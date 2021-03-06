var GetValue = require('../../utils/object/GetValue');
var GetFrames = require('./GetFrames');

var Animation = function (manager, key, config)
{
    this.manager = manager;

    this.key = key;

    //  A frame based animation (as opposed to a bone based animation)
    this.type = 'frame';

    //  Extract all the frame data into the frames array
    this.frames = GetFrames(manager.textureManager, GetValue(config, 'frames', []));

    //  The frame rate of playback in frames per second (default 24 if duration is null)
    this.frameRate = GetValue(config, 'framerate', null);

    //  How long the animation should play for. If frameRate is set it overrides this value
    //  otherwise frameRate is derived from duration
    this.duration = GetValue(config, 'duration', null);

    if (this.duration === null && this.frameRate === null)
    {
        //  No duration or frameRate given, use default frameRate of 24fps
        this.frameRate = 24;
        this.duration = this.frameRate / this.frames.length;
    }
    else if (this.duration && this.frameRate === null)
    {
        //  Duration given but no frameRate, so set the frameRate based on duration
        //  I.e. 12 frames in the animation, duration = 4 (4000 ms)
        //  So frameRate is 12 / 4 = 3 fps
        this.frameRate = this.frames.length / this.duration;
    }
    else
    {
        //  frameRate given, derive duration from it (even if duration also specified)
        //  I.e. 15 frames in the animation, frameRate = 30 fps
        //  So duration is 15 / 30 = 0.5 (half a second)
        this.duration = this.frames.length / this.frameRate;
    }

    //  ms per frame (without including frame specific modifiers)
    this.msPerFrame = 1000 / this.frameRate;

    //  Skip frames if the time lags, or always advanced anyway?
    this.skipMissedFrames = GetValue(config, 'skipMissedFrames', true);

    //  Delay before starting playback (in seconds)
    this.delay = GetValue(config, 'delay', 0);

    //  Number of times to repeat the animation (-1 for infinity)
    this.repeat = GetValue(config, 'repeat', 0);

    //  Delay before the repeat starts (in seconds)
    this.repeatDelay = GetValue(config, 'repeatDelay', 0);

    //  Should the animation yoyo? (reverse back down to the start) before repeating?
    this.yoyo = GetValue(config, 'yoyo', false);

    //  Should sprite.visible = true when the animation starts to play?
    this.showOnStart = GetValue(config, 'showOnStart', false);

    //  Should sprite.visible = false when the animation finishes?
    this.hideOnComplete = GetValue(config, 'hideOnComplete', false);

    //  Callbacks
    this.callbackScope = GetValue(config, 'callbackScope', this);

    this.onStart = GetValue(config, 'onStart', false);
    this.onStartParams = GetValue(config, 'onStartParams', []);

    this.onRepeat = GetValue(config, 'onRepeat', false);
    this.onRepeatParams = GetValue(config, 'onRepeatParams', []);

    //  Called for EVERY frame of the animation.
    //  See AnimationFrame.onUpdate for a frame specific callback.
    this.onUpdate = GetValue(config, 'onUpdate', false);
    this.onUpdateParams = GetValue(config, 'onUpdateParams', []);

    this.onComplete = GetValue(config, 'onComplete', false);
    this.onCompleteParams = GetValue(config, 'onCompleteParams', []);
};

Animation.prototype.constructor = Animation;

Animation.prototype = {

    load: function (component, startFrame)
    {
        if (startFrame >= this.frames.length)
        {
            startFrame = 0;
        }

        if (component.currentAnim !== this)
        {
            component.currentAnim = this;

            component._timeScale = 1;
            component.frameRate = this.frameRate;
            component.duration = this.duration;
            component.msPerFrame = this.msPerFrame;
            component.skipMissedFrames = this.skipMissedFrames;
            component._delay = this.delay;
            component._repeat = this.repeat;
            component._repeatDelay = this.repeatDelay;
            component._yoyo = this.yoyo;
            component._callbackArgs[1] = this;
            component._updateParams = component._callbackArgs.concat(this.onUpdateParams);
        }

        component.updateFrame(this.frames[startFrame]);
    },

    checkFrame: function (index)
    {
        return (index < this.frames.length);
    },

    getFirstTick: function (component, includeDelay)
    {
        if (includeDelay === undefined) { includeDelay = true; }

        //  When is the first update due?
        component.accumulator = 0;
        component.nextTick = component.msPerFrame + component.currentFrame.duration;

        if (includeDelay)
        {
            component.nextTick += (component._delay * 1000);
        }
    },

    getNextTick: function (component)
    {
        //  When is the next update due?
        component.accumulator -= component.nextTick;
        component.nextTick = component.msPerFrame + component.currentFrame.duration;
    },

    nextFrame: function (component)
    {
        var frame = component.currentFrame;

        //  TODO: Add frame skip support

        if (frame.isLast)
        {
            //  We're at the end of the animation

            //  Yoyo? (happens before repeat)
            if (this.yoyo)
            {
                component.forward = false;
    
                component.updateFrame(frame.prevFrame);

                //  Delay for the current frame
                this.getNextTick(component);
            }
            else if (component.repeatCounter > 0)
            {
                //  Repeat (happens before complete)
                this.repeatAnimation(component);
            }
            else
            {
                this.completeAnimation(component);
            }
        }
        else
        {
            component.updateFrame(frame.nextFrame);

            this.getNextTick(component);
        }
    },

    previousFrame: function (component)
    {
        var frame = component.currentFrame;

        //  TODO: Add frame skip support

        if (frame.isFirst)
        {
            //  We're at the start of the animation

            if (component.repeatCounter > 0)
            {
                //  Repeat (happens before complete)
                this.repeatAnimation(component);
            }
            else
            {
                this.completeAnimation(component);
            }
        }
        else
        {
            component.updateFrame(frame.prevFrame);

            this.getNextTick(component);
        }
    },

    repeatAnimation: function (component)
    {
        if (component._repeatDelay > 0 && component.pendingRepeat === false)
        {
            component.pendingRepeat = true;
            component.accumulator -= component.nextTick;
            component.nextTick += (component._repeatDelay * 1000);
        }
        else
        {
            component.repeatCounter--;

            component.forward = true;

            component.updateFrame(component.currentFrame.nextFrame);

            this.getNextTick(component);

            component.pendingRepeat = false;
    
            if (this.onRepeat)
            {
                this.onRepeat.apply(this.callbackScope, component._callbackArgs.concat(this.onRepeatParams));
            }
        }
    },

    completeAnimation: function (component)
    {
        if (this.hideOnComplete)
        {
            component.parent.visible = false;
        }

        component.stop(true);
    },

    setFrame: function (component)
    {
        //  Work out which frame should be set next on the child, and set it
        if (component.forward)
        {
            this.nextFrame(component);
        }
        else
        {
            this.previousFrame(component);
        }
    },

    toJSON: function ()
    {
        var output = {
            key: this.key,
            type: this.type,
            frames: [],
            framerate: this.frameRate,
            duration: this.duration,
            skipMissedFrames: this.skipMissedFrames,
            delay: this.delay,
            repeat: this.repeat,
            repeatDelay: this.repeatDelay,
            yoyo: this.yoyo,
            showOnStart: this.showOnStart,
            hideOnComplete: this.hideOnComplete
        };

        this.frames.forEach(function (frame)
        {
            output.frames.push(frame.toJSON());
        });

        return output;
    },

    destroy: function ()
    {

    }
};

module.exports = Animation;
